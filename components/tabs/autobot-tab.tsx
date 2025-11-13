"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Play, Square, AlertCircle, AlertTriangle, Activity } from "lucide-react"
import { useDerivAPI } from "@/lib/deriv-api-context"
import { useDerivAuth } from "@/hooks/use-deriv-auth"
import { AutoBot, type BotStrategy, type AutoBotState, type AutoBotConfig } from "@/lib/autobots"
import { TickHistoryManager } from "@/lib/tick-history-manager"

interface AutoBotTabProps {
  theme?: "light" | "dark"
  symbol: string
}

interface BotConfig {
  initialStake: number
  tpPercent: number
  slPercent: number
  useMartingale: boolean
  martingaleMultiplier: number
  duration: number
}

interface TradeLogEntry {
  id: string
  time: Date
  strategy: string
  contract: string
  predicted: string
  entry: string
  exit: string
  stake: number
  result: "win" | "loss"
  profitLoss: number
}

const BOT_STRATEGIES: {
  id: BotStrategy
  name: string
  description: string
  condition: string
}[] = [
  {
    id: "EVEN_ODD",
    name: "EVEN/ODD Bot",
    description: "Analyzes Even/Odd digit bias over last 50 ticks",
    condition: "Entry: When even/odd reaches 56%+ and increasing. Wait at 50-56%. Exit after 1 tick.",
  },
  {
    id: "OVER3_UNDER6",
    name: "OVER3/UNDER6 Bot",
    description: "Trades Over 3 (4-9) vs Under 6 (0-5)",
    condition: "Entry: 60%+ = STRONG signal. 56-60% = TRADE NOW. 53-56% = WAIT. Exit after 1 tick.",
  },
  {
    id: "OVER2_UNDER7",
    name: "OVER2/UNDER7 Bot",
    description: "Trades Over 2 (3-9) vs Under 7 (0-6)",
    condition: "Entry: When 0-6 dominates 60%+, trade Under 7. When 3-9 dominates, trade Over 2.",
  },
  {
    id: "OVER1_UNDER8",
    name: "OVER1/UNDER8 Bot",
    description: "Advanced Over 1 (2-9) vs Under 8 (0-7)",
    condition: "Entry: Analyzes last 25 ticks. 60%+ threshold. Exit after 1 tick.",
  },
  {
    id: "UNDER6",
    name: "UNDER6 Bot",
    description: "Specialized for digits 0-6",
    condition: "Entry: When 0-4 appears 50%+, trade Under 6. Wait for predictable patterns.",
  },
  {
    id: "DIFFERS",
    name: "DIFFERS Bot",
    description: "Selects digits 2-7 with <10% frequency",
    condition: "Entry: Wait 3 ticks without digit appearance, then trade. High precision strategy.",
  },
]

export function AutoBotTab({ theme = "dark", symbol }: AutoBotTabProps) {
  const { apiClient, isConnected, isAuthorized, error: apiError } = useDerivAPI()
  const { accountInfo } = useDerivAuth()

  const [activeBots, setActiveBots] = useState<Map<BotStrategy, AutoBot>>(new Map())
  const [botStates, setBotStates] = useState<Map<BotStrategy, AutoBotState>>(new Map())
  const [botAnalysis, setBotAnalysis] = useState<Map<BotStrategy, any>>(new Map())
  const [botReadyStatus, setBotReadyStatus] = useState<Map<BotStrategy, boolean>>(new Map())
  const [botConfigs, setBotConfigs] = useState<Map<BotStrategy, BotConfig>>(new Map())
  const [botTickData, setBotTickData] = useState<Map<BotStrategy, number[]>>(new Map())
  const [tradeLogs, setTradeLogs] = useState<TradeLogEntry[]>([])
  const [showMartingaleConfig, setShowMartingaleConfig] = useState<Map<BotStrategy, boolean>>(new Map())

  const tickManagerRef = useRef<TickHistoryManager | null>(null)

  useEffect(() => {
    const defaultConfig: BotConfig = {
      initialStake: 0.35,
      tpPercent: 10,
      slPercent: 50,
      useMartingale: false,
      martingaleMultiplier: 2,
      duration: 1, // Default to 1 tick
    }

    const configs = new Map<BotStrategy, BotConfig>()
    BOT_STRATEGIES.forEach((strategy) => {
      configs.set(strategy.id, { ...defaultConfig })
    })
    setBotConfigs(configs)
  }, [])

  useEffect(() => {
    if (!apiClient || !isConnected) return

    const initTickData = async () => {
      if (!tickManagerRef.current) {
        tickManagerRef.current = new TickHistoryManager(apiClient)
      }

      console.log("[v0] Loading tick history for AutoBots...")
      await tickManagerRef.current.loadTickHistorySequentially([symbol], 50)
      await tickManagerRef.current.subscribeToMarkets([symbol])
      console.log("[v0] Tick history loaded and subscribed")
    }

    initTickData()

    const analyzeInterval = setInterval(async () => {
      if (!tickManagerRef.current) return

      const latestDigits = tickManagerRef.current.getTickBuffer(symbol)

      if (latestDigits.length > 0) {
        console.log(`[v0] AutoBot received ${latestDigits.length} ticks for analysis`)
      }

      if (latestDigits.length < 25) {
        console.log("[v0] Waiting for more ticks...")
        return
      }

      for (const strategy of BOT_STRATEGIES) {
        try {
          setBotTickData((prev) => new Map(prev).set(strategy.id, latestDigits))

          const analysis = analyzeStrategy(strategy.id, latestDigits)
          setBotAnalysis((prev) => new Map(prev).set(strategy.id, analysis))

          const isReady = analysis.marketPower >= 56 && analysis.trend === "increasing"
          setBotReadyStatus((prev) => new Map(prev).set(strategy.id, isReady))
        } catch (error) {
          console.error(`[v0] Analysis error for ${strategy.id}:`, error)
        }
      }
    }, 2000)

    return () => {
      clearInterval(analyzeInterval)
      if (tickManagerRef.current) {
        tickManagerRef.current.cleanup()
      }
    }
  }, [apiClient, isConnected, symbol])

  const analyzeStrategy = (strategy: BotStrategy, digits: number[]) => {
    if (digits.length < 25) {
      return {
        marketPower: 0,
        trend: "neutral",
        signal: "WAIT",
        entryPoint: null,
        exitPoint: null,
        distribution: {},
        powerDistribution: {},
      }
    }

    const last10 = digits.slice(-10)
    const last50 = digits

    const digitFrequency: Record<number, number> = {}
    for (let i = 0; i <= 9; i++) {
      digitFrequency[i] = last50.filter((d) => d === i).length
    }

    switch (strategy) {
      case "EVEN_ODD": {
        const evenCount = last50.filter((d) => d % 2 === 0).length
        const evenPercent = (evenCount / last50.length) * 100
        const oddPercent = 100 - evenPercent
        const maxPercent = Math.max(evenPercent, oddPercent)

        const evenLast10 = last10.filter((d) => d % 2 === 0).length
        const evenPercentLast10 = (evenLast10 / 10) * 100
        const trend = evenPercentLast10 > evenPercent ? "increasing" : "decreasing"

        return {
          marketPower: maxPercent,
          trend,
          signal: maxPercent >= 56 && trend === "increasing" ? "TRADE NOW" : maxPercent >= 50 ? "WAIT" : "NEUTRAL",
          entryPoint: evenPercent > oddPercent ? "EVEN" : "ODD",
          exitPoint: "After 1 tick",
          distribution: { even: evenPercent.toFixed(1), odd: oddPercent.toFixed(1) },
          powerDistribution: digitFrequency,
        }
      }

      case "OVER3_UNDER6": {
        const overCount = last50.filter((d) => d >= 4).length
        const underCount = last50.filter((d) => d <= 5).length
        const overPercent = (overCount / last50.length) * 100
        const underPercent = (underCount / last50.length) * 100
        const maxPercent = Math.max(overPercent, underPercent)

        return {
          marketPower: maxPercent,
          trend: maxPercent >= 60 ? "strong" : maxPercent >= 56 ? "increasing" : "neutral",
          signal: maxPercent >= 60 ? "STRONG" : maxPercent >= 56 ? "TRADE NOW" : maxPercent >= 53 ? "WAIT" : "NEUTRAL",
          entryPoint: overPercent > underPercent ? "OVER 3" : "UNDER 6",
          exitPoint: "After 1 tick",
          distribution: { over: overPercent.toFixed(1), under: underPercent.toFixed(1) },
          powerDistribution: digitFrequency,
        }
      }

      case "OVER2_UNDER7": {
        const overCount = last50.filter((d) => d >= 3).length
        const underCount = last50.filter((d) => d <= 6).length
        const overPercent = (overCount / last50.length) * 100
        const underPercent = (underCount / last50.length) * 100
        const maxPercent = Math.max(overPercent, underPercent)

        return {
          marketPower: maxPercent,
          trend: maxPercent >= 60 ? "strong" : "neutral",
          signal: maxPercent >= 60 ? "TRADE NOW" : maxPercent >= 56 ? "WAIT" : "NEUTRAL",
          entryPoint: overPercent > underPercent ? "OVER 2" : "UNDER 7",
          exitPoint: "After 1 tick",
          distribution: { over: overPercent.toFixed(1), under: underPercent.toFixed(1) },
          powerDistribution: digitFrequency,
        }
      }

      case "OVER1_UNDER8": {
        const overCount = last50.filter((d) => d >= 2).length
        const underCount = last50.filter((d) => d <= 7).length
        const overPercent = (overCount / last50.length) * 100
        const underPercent = (underCount / last50.length) * 100
        const maxPercent = Math.max(overPercent, underPercent)

        return {
          marketPower: maxPercent,
          trend: maxPercent >= 60 ? "strong" : "neutral",
          signal: maxPercent >= 60 ? "TRADE NOW" : "NEUTRAL",
          entryPoint: overPercent > underPercent ? "OVER 1" : "UNDER 8",
          exitPoint: "After 1 tick",
          distribution: { over: overPercent.toFixed(1), under: underPercent.toFixed(1) },
          powerDistribution: digitFrequency,
        }
      }

      case "UNDER6": {
        const under4Count = last50.filter((d) => d <= 4).length
        const under4Percent = (under4Count / last50.length) * 100

        return {
          marketPower: under4Percent,
          trend: under4Percent >= 50 ? "strong" : "neutral",
          signal: under4Percent >= 50 ? "TRADE NOW" : "WAIT",
          entryPoint: "UNDER 6",
          exitPoint: "After 1 tick",
          distribution: { under4: under4Percent.toFixed(1) },
          powerDistribution: digitFrequency,
        }
      }

      case "DIFFERS": {
        const frequency: Record<number, number> = {}
        for (let i = 2; i <= 7; i++) {
          frequency[i] = last50.filter((d) => d === i).length
        }

        let lowestDigit = 2
        let lowestCount = last50.length

        for (let i = 2; i <= 7; i++) {
          if (frequency[i] < lowestCount) {
            lowestCount = frequency[i]
            lowestDigit = i
          }
        }

        const lowestPercent = (lowestCount / last50.length) * 100

        return {
          marketPower: 100 - lowestPercent,
          trend: lowestPercent < 10 ? "strong" : "neutral",
          signal: lowestPercent < 10 ? "TRADE NOW" : "WAIT",
          entryPoint: `DIFFERS ${lowestDigit}`,
          exitPoint: "After 1 tick",
          distribution: { lowestDigit, frequency: lowestPercent.toFixed(1) },
          powerDistribution: digitFrequency,
        }
      }

      default:
        return {
          marketPower: 0,
          trend: "neutral",
          signal: "WAIT",
          entryPoint: null,
          exitPoint: null,
          distribution: {},
          powerDistribution: digitFrequency,
        }
    }
  }

  const handleStartBot = async (strategy: BotStrategy) => {
    const isAlreadyRunning = activeBots.has(strategy)
    if (isAlreadyRunning) {
      console.log(`[v0] ${strategy} bot is already running`)
      return
    }

    try {
      if (!apiClient || !isConnected || !isAuthorized) {
        console.error("[v0] Cannot start bot - API not ready:", {
          hasClient: !!apiClient,
          isConnected,
          isAuthorized,
        })
        return
      }

      const botConfig = botConfigs.get(strategy)
      if (!botConfig) return

      if (botConfig.initialStake <= 0) {
        console.error("[v0] Initial stake must be greater than 0")
        return
      }
      if (botConfig.initialStake > (accountInfo?.balance || 0)) {
        console.error("[v0] Initial stake cannot exceed account balance")
        return
      }

      const validatedStake = Math.round(botConfig.initialStake * 100) / 100
      const autoBotConfig: AutoBotConfig = {
        symbol: symbol,
        historyCount: 1000,
        duration: botConfig.duration,
        durationUnit: "t",
        tpPercent: botConfig.tpPercent,
        slPercent: botConfig.slPercent,
        useMartingale: botConfig.useMartingale,
        martingaleMultiplier: botConfig.martingaleMultiplier,
        cooldownMs: 300,
        maxTradesPerMinute: 120,
        initialStake: validatedStake,
        balance: accountInfo?.balance || 1000,
      }

      console.log(`[v0] Starting ${strategy} bot with config:`, autoBotConfig)

      setBotStates((prev) =>
        new Map(prev).set(strategy, {
          wins: 0,
          losses: 0,
          profitLoss: 0,
          isAnalyzing: true,
          isTrading: false,
          lastTrade: null,
        }),
      )

      const newBot = new AutoBot(apiClient, strategy, autoBotConfig)

      await newBot.start((state) => {
        console.log(`[v0] ${strategy} bot state updated:`, state)
        setBotStates((prev) => new Map(prev).set(strategy, state))

        if (state.lastTrade) {
          const logEntry: TradeLogEntry = {
            id: `${strategy}-${Date.now()}`,
            time: new Date(),
            strategy: BOT_STRATEGIES.find((s) => s.id === strategy)?.name || strategy,
            contract: state.lastTrade.contractType || "N/A",
            predicted: state.lastTrade.prediction || "N/A",
            entry: state.lastTrade.entrySpot?.toString() || "N/A",
            exit: state.lastTrade.exitSpot?.toString() || "N/A",
            stake: state.lastTrade.stake || 0,
            result: state.lastTrade.isWin ? "win" : "loss",
            profitLoss: state.lastTrade.profit || 0,
          }
          setTradeLogs((prev) => [logEntry, ...prev.slice(0, 99)])
        }
      })

      setActiveBots((prev) => new Map(prev).set(strategy, newBot))
    } catch (error: any) {
      console.error(`[v0] Error starting ${strategy} bot:`, error)
    }
  }

  const handleStopBot = (strategy: BotStrategy) => {
    const bot = activeBots.get(strategy)
    if (bot) {
      console.log(`[v0] Stopping ${strategy} bot...`)
      bot.stop()
      setActiveBots((prev) => {
        const newMap = new Map(prev)
        newMap.delete(strategy)
        return newMap
      })
      setBotStates((prev) => {
        const newMap = new Map(prev)
        newMap.delete(strategy)
        return newMap
      })
    }
  }

  const handleEmergencyStopAll = () => {
    console.log("[v0] EMERGENCY STOP ACTIVATED for all bots")
    activeBots.forEach((bot, strategy) => {
      bot.stop()
      console.log(`[v0] Stopped ${strategy} bot during emergency stop.`)
    })
    setActiveBots(new Map())
    setBotStates(new Map())
  }

  const updateBotConfig = (strategy: BotStrategy, updates: Partial<BotConfig>) => {
    setBotConfigs((prev) => {
      const newConfigs = new Map(prev)
      const currentConfig = newConfigs.get(strategy) || {
        initialStake: 0.35,
        tpPercent: 10,
        slPercent: 50,
        useMartingale: false,
        martingaleMultiplier: 2,
        duration: 1,
      }
      newConfigs.set(strategy, { ...currentConfig, ...updates })
      return newConfigs
    })
  }

  return (
    <div className="space-y-6">
      {/* Connection Status Alert */}
      {(apiError || !isConnected) && (
        <Card className={theme === "dark" ? "bg-red-500/10 border-red-500/30" : "bg-red-50 border-red-200"}>
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className={`w-5 h-5 flex-shrink-0 ${theme === "dark" ? "text-red-400" : "text-red-600"}`} />
            <div>
              <p className={`font-semibold ${theme === "dark" ? "text-red-400" : "text-red-700"}`}>Connection Issue</p>
              <p className={`text-sm mt-1 ${theme === "dark" ? "text-red-300" : "text-red-600"}`}>
                {apiError || "Connecting to API..."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Market Display */}
      <Card
        className={
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
            : "bg-white border-gray-200"
        }
      >
        <CardHeader>
          <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>Trading Market</CardTitle>
          <CardDescription className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            All bots will trade on this market
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <p className={`text-lg font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>{symbol}</p>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Stop Button for ALL bots */}
      {activeBots.size > 0 && (
        <Card className={theme === "dark" ? "bg-orange-500/10 border-orange-500/30" : "bg-orange-50 border-orange-200"}>
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className={`w-5 h-5 flex-shrink-0 ${theme === "dark" ? "text-orange-400" : "text-orange-600"}`}
              />
              <div>
                <p className={`font-semibold ${theme === "dark" ? "text-orange-400" : "text-orange-700"}`}>
                  Active Bots Detected
                </p>
                <p className={`text-sm mt-1 ${theme === "dark" ? "text-orange-300" : "text-orange-600"}`}>
                  Click "EMERGENCY STOP ALL" to halt all running bots immediately.
                </p>
              </div>
            </div>
            <Button
              onClick={handleEmergencyStopAll}
              className="bg-red-600 hover:bg-red-700 text-white ml-4 flex-shrink-0"
            >
              🚨 EMERGENCY STOP ALL
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Bot Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BOT_STRATEGIES.map((strategy) => {
          const analysis = botAnalysis.get(strategy.id)
          const isReady = botReadyStatus.get(strategy.id) || false
          const botState = botStates.get(strategy.id)
          const isRunning = activeBots.has(strategy.id)
          const botConfig = botConfigs.get(strategy.id) || {
            initialStake: 0.35,
            tpPercent: 10,
            slPercent: 50,
            useMartingale: false,
            martingaleMultiplier: 2,
            duration: 1,
          }
          const tickData = botTickData.get(strategy.id) || []

          return (
            <Card
              key={strategy.id}
              className={`${
                isReady && !isRunning
                  ? theme === "dark"
                    ? "bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.4)] animate-pulse"
                    : "bg-gradient-to-br from-green-50 to-emerald-50 border-green-400"
                  : theme === "dark"
                    ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
                    : "bg-white border-gray-200"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className={`text-base ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {strategy.name}
                    </CardTitle>
                    <CardDescription className={`text-xs mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      {strategy.description}
                    </CardDescription>
                    <div className={`text-xs mt-1 ${theme === "dark" ? "text-cyan-400" : "text-cyan-600"}`}>
                      Data: {tickData.length} ticks
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {isReady && !isRunning && <Badge className="bg-green-500 text-white animate-pulse">READY</Badge>}
                    {isRunning && (
                      <Badge className="bg-blue-500 text-white">
                        <Activity className="w-3 h-3 mr-1 animate-spin" />
                        TRADING
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Live Market Data */}
                {analysis && (
                  <>
                    <div
                      className={`p-3 rounded-lg ${theme === "dark" ? "bg-blue-500/10 border border-blue-500/30" : "bg-blue-50 border border-blue-200"}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Market Power
                        </span>
                        <span className={`text-sm font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                          {analysis.marketPower.toFixed(1)}%
                        </span>
                      </div>
                      <Progress
                        value={analysis.marketPower}
                        className={`h-2 ${theme === "dark" ? "bg-gray-700" : "bg-gray-200"}`}
                      />
                    </div>

                    {/* Power Distribution */}
                    {analysis.powerDistribution && (
                      <div
                        className={`p-3 rounded-lg ${theme === "dark" ? "bg-purple-500/10 border border-purple-500/30" : "bg-purple-50 border border-purple-200"}`}
                      >
                        <div
                          className={`text-xs font-semibold mb-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                        >
                          Power Distribution
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {Object.entries(analysis.powerDistribution).map(([digit, count]) => (
                            <div key={digit} className="text-center">
                              <div className={`text-xs ${theme === "dark" ? "text-gray-500" : "text-gray-600"}`}>
                                {digit}
                              </div>
                              <div className={`text-xs font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                                {count}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Statistical Analysis */}
                    <div
                      className={`p-3 rounded-lg text-xs ${theme === "dark" ? "bg-gray-800 border border-gray-700" : "bg-gray-50 border border-gray-200"}`}
                    >
                      <div className={`font-semibold mb-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                        Signal:{" "}
                        <span
                          className={`
                          ${analysis.signal === "STRONG" ? "text-green-400" : ""}
                          ${analysis.signal === "TRADE NOW" ? "text-yellow-400" : ""}
                          ${analysis.signal === "WAIT" ? "text-blue-400" : ""}
                          ${analysis.signal === "NEUTRAL" ? "text-gray-400" : ""}
                        `}
                        >
                          {analysis.signal}
                        </span>
                      </div>
                      <div className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                        Entry: {analysis.entryPoint || "N/A"}
                      </div>
                      <div className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                        Exit: {analysis.exitPoint || "N/A"}
                      </div>
                    </div>
                  </>
                )}

                {/* Bot Configuration - Each bot has its own */}
                {!isRunning && (
                  <div className="space-y-2 pt-2 border-t border-gray-700">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Stake ($)
                        </Label>
                        <Input
                          type="number"
                          value={botConfig.initialStake}
                          onChange={(e) =>
                            updateBotConfig(strategy.id, { initialStake: Number.parseFloat(e.target.value) })
                          }
                          className={`h-8 text-xs ${theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                          step="0.01"
                          min="0.01"
                        />
                      </div>
                      <div>
                        <Label className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Ticks
                        </Label>
                        <Input
                          type="number"
                          value={botConfig.duration}
                          onChange={(e) => updateBotConfig(strategy.id, { duration: Number.parseInt(e.target.value) })}
                          className={`h-8 text-xs ${theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                          min="1"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={botConfig.useMartingale}
                          onCheckedChange={(checked) => {
                            updateBotConfig(strategy.id, { useMartingale: checked })
                            setShowMartingaleConfig((prev) => new Map(prev).set(strategy.id, checked))
                          }}
                          className="scale-75"
                        />
                        <Label className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Martingale
                        </Label>
                      </div>
                      {botConfig.useMartingale && (
                        <Input
                          type="number"
                          value={botConfig.martingaleMultiplier}
                          onChange={(e) =>
                            updateBotConfig(strategy.id, { martingaleMultiplier: Number.parseFloat(e.target.value) })
                          }
                          className={`h-8 text-xs w-20 ${theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                          step="0.1"
                          min="1.1"
                          placeholder="x2"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Bot Stats if running */}
                {botState && (
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className={`p-2 rounded-lg text-center ${theme === "dark" ? "bg-green-500/10" : "bg-green-50"}`}
                    >
                      <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Wins</div>
                      <div className={`text-lg font-bold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                        {botState.wins}
                      </div>
                    </div>
                    <div className={`p-2 rounded-lg text-center ${theme === "dark" ? "bg-red-500/10" : "bg-red-50"}`}>
                      <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Losses</div>
                      <div className={`text-lg font-bold ${theme === "dark" ? "text-red-400" : "text-red-600"}`}>
                        {botState.losses}
                      </div>
                    </div>
                    <div
                      className={`col-span-2 p-2 rounded-lg text-center ${botState.profitLoss >= 0 ? (theme === "dark" ? "bg-green-500/10" : "bg-green-50") : theme === "dark" ? "bg-red-500/10" : "bg-red-50"}`}
                    >
                      <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>P/L</div>
                      <div
                        className={`text-lg font-bold ${botState.profitLoss >= 0 ? (theme === "dark" ? "text-green-400" : "text-green-600") : theme === "dark" ? "text-red-400" : "text-red-600"}`}
                      >
                        ${botState.profitLoss.toFixed(2)}
                      </div>
                    </div>
                    <div className="col-span-2 text-center">
                      <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                        {botState.isAnalyzing ? "Analyzing..." : botState.isTrading ? "Placing Trade..." : "Monitoring"}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Start/Stop Button */}
                {isRunning ? (
                  <Button
                    onClick={() => handleStopBot(strategy.id)}
                    variant="destructive"
                    className="w-full gap-2"
                    size="sm"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      console.log(`[v0] Start button clicked for ${strategy.id}`)
                      handleStartBot(strategy.id)
                    }}
                    className={`w-full gap-2 ${
                      isReady ? "bg-green-500 hover:bg-green-600 animate-pulse" : "bg-blue-500 hover:bg-blue-600"
                    }`}
                    disabled={!isConnected || !isAuthorized || tickData.length < 25}
                    size="sm"
                  >
                    <Play className="w-4 h-4" />
                    {tickData.length < 25 ? `Loading... (${tickData.length}/25)` : isReady ? "Start Trading" : "Start"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Trade Log */}
      {tradeLogs.length > 0 && (
        <Card
          className={`border ${
            theme === "dark"
              ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-purple-500/20"
              : "bg-white border-gray-200"
          }`}
        >
          <CardHeader>
            <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>Trade Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr
                    className={`border-b ${theme === "dark" ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-600"}`}
                  >
                    <th className="text-left py-3 px-2 text-xs font-medium">Time</th>
                    <th className="text-left py-3 px-2 text-xs font-medium">Strategy</th>
                    <th className="text-left py-3 px-2 text-xs font-medium">Contract</th>
                    <th className="text-left py-3 px-2 text-xs font-medium">Predicted</th>
                    <th className="text-left py-3 px-2 text-xs font-medium">Entry</th>
                    <th className="text-left py-3 px-2 text-xs font-medium">Exit</th>
                    <th className="text-left py-3 px-2 text-xs font-medium">Stake</th>
                    <th className="text-left py-3 px-2 text-xs font-medium">Result</th>
                    <th className="text-right py-3 px-2 text-xs font-medium">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeLogs.map((trade) => (
                    <tr
                      key={trade.id}
                      className={`border-b ${theme === "dark" ? "border-gray-800 hover:bg-gray-800/30" : "border-gray-100 hover:bg-gray-50"}`}
                    >
                      <td className={`py-3 px-2 text-xs ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                        {trade.time.toLocaleTimeString()}
                      </td>
                      <td className={`py-3 px-2 text-xs ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                        {trade.strategy}
                      </td>
                      <td className={`py-3 px-2 text-xs ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                        {trade.contract}
                      </td>
                      <td className={`py-3 px-2 text-xs ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                        {trade.predicted}
                      </td>
                      <td
                        className={`py-3 px-2 text-xs font-mono ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                      >
                        {trade.entry}
                      </td>
                      <td
                        className={`py-3 px-2 text-xs font-mono ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                      >
                        {trade.exit}
                      </td>
                      <td className={`py-3 px-2 text-xs ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                        ${trade.stake.toFixed(2)}
                      </td>
                      <td className="py-3 px-2">
                        <Badge
                          className={`text-xs ${
                            trade.result === "win"
                              ? theme === "dark"
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : "bg-green-100 text-green-700 border-green-200"
                              : theme === "dark"
                                ? "bg-red-500/20 text-red-400 border-red-500/30"
                                : "bg-red-100 text-red-700 border-red-200"
                          }`}
                        >
                          {trade.result.toUpperCase()}
                        </Badge>
                      </td>
                      <td
                        className={`py-3 px-2 text-xs font-bold text-right ${
                          trade.profitLoss >= 0
                            ? theme === "dark"
                              ? "text-green-400"
                              : "text-green-600"
                            : theme === "dark"
                              ? "text-red-400"
                              : "text-red-600"
                        }`}
                      >
                        {trade.profitLoss >= 0 ? "+" : ""}${trade.profitLoss.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
