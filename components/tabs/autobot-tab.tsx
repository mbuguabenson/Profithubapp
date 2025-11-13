"use client"

import { useState, useEffect } from "react"
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

interface AutoBotTabProps {
  theme?: "light" | "dark"
  symbol: string
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
    condition: "Entry: When even/odd reaches 56%+ and increasing. Wait at 50-56%. Exit after 5 ticks.",
  },
  {
    id: "OVER3_UNDER6",
    name: "OVER3/UNDER6 Bot",
    description: "Trades Over 3 (4-9) vs Under 6 (0-5)",
    condition: "Entry: 60%+ = STRONG signal. 56-60% = TRADE NOW. 53-56% = WAIT. Exit after 5 ticks.",
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
    condition: "Entry: Analyzes last 25 ticks. 60%+ threshold. Exit after 5 ticks.",
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

  const [config, setConfig] = useState<AutoBotConfig>({
    symbol: symbol,
    historyCount: 1000,
    duration: 5,
    durationUnit: "t",
    tpPercent: 10,
    slPercent: 50,
    useMartingale: false,
    martingaleMultiplier: 2,
    cooldownMs: 300,
    maxTradesPerMinute: 120,
    initialStake: 0.35,
    balance: accountInfo?.balance || 1000,
  })

  useEffect(() => {
    setConfig((prev) => ({ ...prev, symbol: symbol }))
  }, [symbol])

  useEffect(() => {
    if (accountInfo?.balance) {
      setConfig((prev) => ({ ...prev, balance: accountInfo.balance }))
    }
  }, [accountInfo])

  useEffect(() => {
    if (!apiClient || !isConnected) return

    const analyzeInterval = setInterval(async () => {
      for (const strategy of BOT_STRATEGIES) {
        try {
          // Fetch tick history for analysis (e.g., last 50 ticks)
          const response = await apiClient.getTickHistory(symbol, 50)
          const latestDigits = response.prices.map((price: number) => {
            const priceStr = price.toFixed(5)
            return Number.parseInt(priceStr[priceStr.length - 1])
          })

          const analysis = analyzeStrategy(strategy.id, latestDigits)
          setBotAnalysis((prev) => new Map(prev).set(strategy.id, analysis))

          // Check if conditions are met for READY status
          // This is a simplified example, adjust conditions based on bot strategy
          const isReady = analysis.marketPower >= 56 && analysis.trend === "increasing"
          setBotReadyStatus((prev) => new Map(prev).set(strategy.id, isReady))
        } catch (error) {
          console.error(`[v0] Analysis error for ${strategy.id}:`, error)
        }
      }
    }, 2000) // Update every 2 seconds

    return () => clearInterval(analyzeInterval)
  }, [apiClient, isConnected, symbol])

  const analyzeStrategy = (strategy: BotStrategy, digits: number[]) => {
    if (digits.length < 25) {
      // Ensure enough data for meaningful analysis
      return { marketPower: 0, trend: "neutral", signal: "WAIT", entryPoint: null, exitPoint: null }
    }

    const last10 = digits.slice(-10) // For trend analysis
    const last50 = digits // For overall distribution

    switch (strategy) {
      case "EVEN_ODD": {
        const evenCount = last50.filter((d) => d % 2 === 0).length
        const evenPercent = (evenCount / last50.length) * 100
        const oddPercent = 100 - evenPercent
        const maxPercent = Math.max(evenPercent, oddPercent)

        // Trend analysis based on last 10 digits' evenness compared to overall
        const evenLast10 = last10.filter((d) => d % 2 === 0).length
        const evenPercentLast10 = (evenLast10 / 10) * 100
        const trend = evenPercentLast10 > evenPercent ? "increasing" : "decreasing"

        return {
          marketPower: maxPercent,
          trend,
          signal: maxPercent >= 56 && trend === "increasing" ? "TRADE NOW" : maxPercent >= 50 ? "WAIT" : "NEUTRAL",
          entryPoint: evenPercent > oddPercent ? "EVEN" : "ODD",
          exitPoint: "After 5 ticks",
          distribution: { even: evenPercent.toFixed(1), odd: oddPercent.toFixed(1) },
        }
      }

      case "OVER3_UNDER6": {
        const overCount = last50.filter((d) => d >= 4).length // Digits 4, 5, 6, 7, 8, 9
        const underCount = last50.filter((d) => d <= 5).length // Digits 0, 1, 2, 3, 4, 5
        const overPercent = (overCount / last50.length) * 100
        const underPercent = (underCount / last50.length) * 100
        const maxPercent = Math.max(overPercent, underPercent)

        return {
          marketPower: maxPercent,
          trend: maxPercent >= 60 ? "strong" : maxPercent >= 56 ? "increasing" : "neutral", // Simplified trend
          signal: maxPercent >= 60 ? "STRONG" : maxPercent >= 56 ? "TRADE NOW" : maxPercent >= 53 ? "WAIT" : "NEUTRAL",
          entryPoint: overPercent > underPercent ? "OVER 3" : "UNDER 6",
          exitPoint: "After 5 ticks",
          distribution: { over: overPercent.toFixed(1), under: underPercent.toFixed(1) },
        }
      }

      case "OVER2_UNDER7": {
        const overCount = last50.filter((d) => d >= 3).length // Digits 3, 4, 5, 6, 7, 8, 9
        const underCount = last50.filter((d) => d <= 6).length // Digits 0, 1, 2, 3, 4, 5, 6
        const overPercent = (overCount / last50.length) * 100
        const underPercent = (underCount / last50.length) * 100
        const maxPercent = Math.max(overPercent, underPercent)

        return {
          marketPower: maxPercent,
          trend: maxPercent >= 60 ? "strong" : "neutral", // Simplified trend
          signal: maxPercent >= 60 ? "TRADE NOW" : maxPercent >= 56 ? "WAIT" : "NEUTRAL",
          entryPoint: overPercent > underPercent ? "OVER 2" : "UNDER 7",
          exitPoint: "After 5 ticks",
          distribution: { over: overPercent.toFixed(1), under: underPercent.toFixed(1) },
        }
      }

      case "OVER1_UNDER8": {
        const overCount = last50.filter((d) => d >= 2).length // Digits 2-9
        const underCount = last50.filter((d) => d <= 7).length // Digits 0-7
        const overPercent = (overCount / last50.length) * 100
        const underPercent = (underCount / last50.length) * 100
        const maxPercent = Math.max(overPercent, underPercent)

        return {
          marketPower: maxPercent,
          trend: maxPercent >= 60 ? "strong" : "neutral", // Simplified trend
          signal: maxPercent >= 60 ? "TRADE NOW" : "NEUTRAL",
          entryPoint: overPercent > underPercent ? "OVER 1" : "UNDER 8",
          exitPoint: "After 5 ticks",
          distribution: { over: overPercent.toFixed(1), under: underPercent.toFixed(1) },
        }
      }

      case "UNDER6": {
        const under4Count = last50.filter((d) => d <= 4).length // Digits 0, 1, 2, 3, 4
        const under4Percent = (under4Count / last50.length) * 100

        return {
          marketPower: under4Percent,
          trend: under4Percent >= 50 ? "strong" : "neutral", // Simplified trend
          signal: under4Percent >= 50 ? "TRADE NOW" : "WAIT",
          entryPoint: "UNDER 6",
          exitPoint: "After 5 ticks",
          distribution: { under4: under4Percent.toFixed(1) },
        }
      }

      case "DIFFERS": {
        // Count frequency of digits 2 through 7
        const frequency: Record<number, number> = {}
        for (let i = 2; i <= 7; i++) {
          frequency[i] = last50.filter((d) => d === i).length
        }

        // Find the digit with the lowest frequency
        let lowestDigit = 2
        let lowestCount = last50.length // Initialize with a value higher than any possible count

        for (let i = 2; i <= 7; i++) {
          if (frequency[i] < lowestCount) {
            lowestCount = frequency[i]
            lowestDigit = i
          }
        }

        const lowestPercent = (lowestCount / last50.length) * 100

        // Strategy condition: <10% power (meaning the digit appears less than 10% of the time)
        return {
          marketPower: 100 - lowestPercent, // Higher marketPower means less frequent digit is more dominant
          trend: lowestPercent < 10 ? "strong" : "neutral", // 'strong' implies the condition for trading is met
          signal: lowestPercent < 10 ? "TRADE NOW" : "WAIT",
          entryPoint: `DIFFERS ${lowestDigit}`,
          exitPoint: "After 5 ticks",
          distribution: { lowestDigit, frequency: lowestPercent.toFixed(1) }, // Store info about the lowest digit
        }
      }

      default:
        return { marketPower: 0, trend: "neutral", signal: "WAIT", entryPoint: null, exitPoint: null }
    }
  }

  const handleStartBot = async (strategy: BotStrategy) => {
    if (activeBots.has(strategy)) return

    try {
      if (!apiClient || !isConnected || !isAuthorized) {
        console.error("[v0] Cannot start bot - API not ready")
        return
      }

      // Validate and prepare config
      if (config.initialStake <= 0) {
        console.error("[v0] Initial stake must be greater than 0")
        return
      }
      if (config.initialStake > config.balance) {
        console.error("[v0] Initial stake cannot exceed account balance")
        return
      }

      const validatedStake = Math.round(config.initialStake * 100) / 100
      const validatedConfig = { ...config, initialStake: validatedStake }

      console.log(`[v0] Starting ${strategy} bot with config:`, validatedConfig)

      const newBot = new AutoBot(apiClient, strategy, validatedConfig)

      await newBot.start((state) => {
        setBotStates((prev) => new Map(prev).set(strategy, state))
      })

      setActiveBots((prev) => new Map(prev).set(strategy, newBot))
    } catch (error: any) {
      console.error(`[v0] Error starting ${strategy} bot:`, error)
      // Optionally display error to user
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

  // Emergency Stop for ALL bots
  const handleEmergencyStopAll = () => {
    console.log("[v0] EMERGENCY STOP ACTIVATED for all bots")
    activeBots.forEach((bot, strategy) => {
      bot.stop()
      console.log(`[v0] Stopped ${strategy} bot during emergency stop.`)
    })
    setActiveBots(new Map())
    setBotStates(new Map())
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

      {/* Bot Configuration */}
      <Card
        className={
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
            : "bg-white border-gray-200"
        }
      >
        <CardHeader>
          <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>Global Configuration</CardTitle>
          <CardDescription className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            Applied to all bots
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Initial Stake ($)</Label>
              <Input
                type="number"
                value={config.initialStake}
                onChange={(e) => setConfig({ ...config, initialStake: Number.parseFloat(e.target.value) })}
                className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Take Profit (%)</Label>
              <Input
                type="number"
                value={config.tpPercent}
                onChange={(e) => setConfig({ ...config, tpPercent: Number.parseFloat(e.target.value) })}
                className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Stop Loss (%)</Label>
              <Input
                type="number"
                value={config.slPercent}
                onChange={(e) => setConfig({ ...config, slPercent: Number.parseFloat(e.target.value) })}
                className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={config.useMartingale}
              onCheckedChange={(checked) => setConfig({ ...config, useMartingale: checked })}
            />
            <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Enable Martingale</Label>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BOT_STRATEGIES.map((strategy) => {
          const analysis = botAnalysis.get(strategy.id)
          const isReady = botReadyStatus.get(strategy.id) || false
          const botState = botStates.get(strategy.id)
          const isRunning = activeBots.has(strategy.id)

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
                  </div>
                  {isReady && !isRunning && <Badge className="bg-green-500 text-white animate-pulse">READY</Badge>}
                  {isRunning && (
                    <Badge className="bg-blue-500 text-white">
                      <Activity className="w-3 h-3 mr-1 animate-spin" />
                      ACTIVE
                    </Badge>
                  )}
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

                    {/* Statistical Analysis */}
                    <div
                      className={`p-3 rounded-lg ${theme === "dark" ? "bg-purple-500/10 border border-purple-500/30" : "bg-purple-50 border border-purple-200"}`}
                    >
                      <div
                        className={`text-xs font-semibold mb-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                      >
                        Distribution
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(analysis.distribution || {}).map(([key, value]) => (
                          <div key={key} className="text-center">
                            <div className={`text-xs ${theme === "dark" ? "text-gray-500" : "text-gray-600"}`}>
                              {key}
                            </div>
                            <div className={`text-sm font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                              {value}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Trade Conditions */}
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

                {/* Condition Details */}
                <div
                  className={`p-2 rounded text-xs ${theme === "dark" ? "bg-gray-800/50 text-gray-400" : "bg-gray-50 text-gray-600"}`}
                >
                  {strategy.condition}
                </div>

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
                    onClick={() => handleStartBot(strategy.id)}
                    className={`w-full gap-2 ${
                      isReady ? "bg-green-500 hover:bg-green-600 animate-pulse" : "bg-blue-500 hover:bg-blue-600"
                    }`}
                    disabled={!isConnected || !isAuthorized}
                    size="sm"
                  >
                    <Play className="w-4 h-4" />
                    {isReady ? "Start Trading" : "Start"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
