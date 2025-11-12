"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Play, Square, TrendingUp, TrendingDown, AlertCircle, Loader, AlertTriangle } from "lucide-react"
import { useDerivAPI } from "@/lib/deriv-api-context"
import { useDerivAuth } from "@/hooks/use-deriv-auth"
import { AutoBot, type BotStrategy, type AutoBotState, type AutoBotConfig } from "@/lib/autobots"

interface AutoBotTabProps {
  theme?: "light" | "dark"
  symbol: string
}

const BOT_STRATEGIES: { id: BotStrategy; name: string; description: string }[] = [
  {
    id: "EVEN_ODD",
    name: "EVEN/ODD Bot",
    description:
      "Analyzes Even/Odd digit bias. Shows WAIT at 50%+ increasing, TRADE NOW at 56%+. Uses last 1 hour data to detect market direction (55%+ and increasing)",
  },
  {
    id: "OVER3_UNDER6",
    name: "OVER3/UNDER6 Bot",
    description:
      "Analyzes Over 3 (digits 4-9) and Under 6 (digits 0-5). WAIT at 53%+, TRADE NOW at 56%+, STRONG at 60%. Entry when 55%+ and increasing",
  },
  {
    id: "OVER2_UNDER7",
    name: "OVER2/UNDER7 Bot",
    description:
      "Analyzes Over 2 (digits 3-9) and Under 7 (digits 0-6). Predicts next 10-20 ticks. When 0-6 most: Under 7-8, when 0-5: Under 7, when 0-4: Under 6",
  },
  {
    id: "OVER1_UNDER8",
    name: "OVER1/UNDER8 Bot",
    description:
      "Advanced bot for Over 1 (digits 2-9) and Under 8 (digits 0-7). When 0-6: Over 1+2, when 4-9: Over 2, when 5-9: Over 3. Analyzes power dynamics",
  },
  {
    id: "UNDER6",
    name: "UNDER6 Bot",
    description:
      "Specialized for digits 0-6. When 0-4 appears most (50%+), gives Under 6 signal. Requires predictable patterns",
  },
  {
    id: "DIFFERS",
    name: "DIFFERS Bot",
    description:
      "Selects digits 2-7 with <10% power (not most/least appearing). Waits 3 ticks without digit appearance, then trades. High precision strategy",
  },
  {
    id: "EVEN_ODD_ADVANCED",
    name: "EVEN/ODD Advanced",
    description:
      "Advanced volatility detection. WAIT (blue) at 50%+ increasing, TRADE NOW (green) at 56%+ until market changes. Multi-level signal analysis",
  },
  {
    id: "OVER_UNDER_ADVANCED",
    name: "OVER/UNDER Advanced",
    description:
      "Multi-level: 53%=WAIT (blue), 56%+=TRADE NOW (green), 60%+=STRONG signal. Uses last 10-20 ticks for predictability",
  },
]

export function AutoBotTab({ theme = "dark", symbol }: AutoBotTabProps) {
  const { apiClient, isConnected, isAuthorized, error: apiError } = useDerivAPI()
  const { accountInfo } = useDerivAuth()
  const [selectedStrategy, setSelectedStrategy] = useState<BotStrategy>("EVEN_ODD")
  const [bot, setBot] = useState<AutoBot | null>(null)
  const [botState, setBotState] = useState<AutoBotState | null>(null)
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [emergencyStop, setEmergencyStop] = useState(false)

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
    if (emergencyStop && bot) {
      console.log("[v0] EMERGENCY STOP ACTIVATED")
      bot.stop()
      setBot(null)
      setBotState(null)
      setEmergencyStop(false)
    }
  }, [emergencyStop, bot])

  const handleStart = async () => {
    setLocalError(null)
    setIsLoading(true)

    try {
      if (!apiClient) {
        setLocalError("API client not initialized. Please wait for connection...")
        setIsLoading(false)
        return
      }

      if (!isConnected) {
        setLocalError("API not connected. Please check your connection and try again.")
        setIsLoading(false)
        return
      }

      if (!isAuthorized) {
        setLocalError("API not authorized. Please authenticate first.")
        setIsLoading(false)
        return
      }

      if (config.initialStake <= 0) {
        setLocalError("Initial stake must be greater than 0")
        setIsLoading(false)
        return
      }

      if (config.initialStake > config.balance) {
        setLocalError("Initial stake cannot exceed account balance")
        setIsLoading(false)
        return
      }

      const validatedStake = Math.round(config.initialStake * 100) / 100
      const validatedConfig = { ...config, initialStake: validatedStake }

      console.log(`[v0] Starting AutoBot with config:`, validatedConfig)

      const newBot = new AutoBot(apiClient, selectedStrategy, validatedConfig)
      setBot(newBot)

      const updateInterval = setInterval(() => {
        const analysis = newBot.getCurrentAnalysis()
        setAnalysisData(analysis)
      }, 1000)

      try {
        await newBot.start((state) => {
          setBotState(state)
        })
      } catch (err: any) {
        console.error("[v0] Bot start error:", err)
        setLocalError(err.message || "Failed to start bot")
        clearInterval(updateInterval)
        setBot(null)
        setBotState(null)
        setIsLoading(false)
        return
      }

      return () => clearInterval(updateInterval)
    } catch (err: any) {
      console.error("[v0] Error starting bot:", err)
      setLocalError(err.message || "Failed to start bot. Please try again.")
      setBot(null)
      setBotState(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = () => {
    if (bot) {
      console.log("[v0] Stopping bot...")
      bot.stop()
      setBot(null)
      setBotState(null)
      setLocalError(null)
    }
  }

  const tpAmount = (config.balance * config.tpPercent) / 100
  const slAmount = (config.balance * config.slPercent) / 100
  const tpProgress = botState ? Math.min((botState.profitLoss / tpAmount) * 100, 100) : 0
  const slProgress = botState ? Math.min((Math.abs(botState.profitLoss) / slAmount) * 100, 100) : 0

  const isRunning = botState?.isRunning || false
  const canStart = !isRunning && isConnected && isAuthorized && !isLoading

  return (
    <div className="space-y-6">
      {/* Connection Status Alert */}
      {(apiError || localError || !isConnected) && (
        <Card className={theme === "dark" ? "bg-red-500/10 border-red-500/30" : "bg-red-50 border-red-200"}>
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className={`w-5 h-5 flex-shrink-0 ${theme === "dark" ? "text-red-400" : "text-red-600"}`} />
            <div>
              <p className={`font-semibold ${theme === "dark" ? "text-red-400" : "text-red-700"}`}>Connection Issue</p>
              <p className={`text-sm mt-1 ${theme === "dark" ? "text-red-300" : "text-red-600"}`}>
                {localError || apiError || "Connecting to API..."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Emergency Stop Alert */}
      {isRunning && (
        <Card className={theme === "dark" ? "bg-orange-500/10 border-orange-500/30" : "bg-orange-50 border-orange-200"}>
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className={`w-5 h-5 flex-shrink-0 ${theme === "dark" ? "text-orange-400" : "text-orange-600"}`}
              />
              <div>
                <p className={`font-semibold ${theme === "dark" ? "text-orange-400" : "text-orange-700"}`}>
                  Bot Running
                </p>
                <p className={`text-sm mt-1 ${theme === "dark" ? "text-orange-300" : "text-orange-600"}`}>
                  Click Emergency Stop to halt immediately
                </p>
              </div>
            </div>
            <Button
              onClick={() => setEmergencyStop(true)}
              className="bg-red-600 hover:bg-red-700 text-white ml-4 flex-shrink-0"
            >
              🚨 Emergency Stop
            </Button>
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
            Using market from analysis tool
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <p className={`text-lg font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>{symbol}</p>
            <p className={`text-sm mt-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
              All bots will trade on this market
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bot Selection */}
      <Card
        className={
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
            : "bg-white border-gray-200"
        }
      >
        <CardHeader>
          <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>Select AutoBot Strategy</CardTitle>
          <CardDescription className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            Choose a trading bot strategy to automate your trades
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {BOT_STRATEGIES.map((strategy) => (
              <div
                key={strategy.id}
                onClick={() => !isRunning && setSelectedStrategy(strategy.id)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedStrategy === strategy.id
                    ? theme === "dark"
                      ? "bg-blue-500/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                      : "bg-blue-100 border-blue-500"
                    : theme === "dark"
                      ? "bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10"
                      : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <h3 className={`font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  {strategy.name}
                </h3>
                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {strategy.description}
                </p>
              </div>
            ))}
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
          <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>Bot Configuration</CardTitle>
          <CardDescription className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            Configure your bot parameters
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
                disabled={isRunning}
                className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Duration (ticks)</Label>
              <Input
                type="number"
                value={config.duration}
                onChange={(e) => setConfig({ ...config, duration: Number.parseInt(e.target.value) })}
                disabled={isRunning}
                className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Take Profit (%)</Label>
              <Input
                type="number"
                value={config.tpPercent}
                onChange={(e) => setConfig({ ...config, tpPercent: Number.parseFloat(e.target.value) })}
                disabled={isRunning}
                className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Stop Loss (%)</Label>
              <Input
                type="number"
                value={config.slPercent}
                onChange={(e) => setConfig({ ...config, slPercent: Number.parseFloat(e.target.value) })}
                disabled={isRunning}
                className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Cooldown (ms)</Label>
              <Input
                type="number"
                value={config.cooldownMs}
                onChange={(e) => setConfig({ ...config, cooldownMs: Number.parseInt(e.target.value) })}
                disabled={isRunning}
                className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Martingale Multiplier</Label>
              <Input
                type="number"
                step="0.1"
                value={config.martingaleMultiplier}
                onChange={(e) => setConfig({ ...config, martingaleMultiplier: Number.parseFloat(e.target.value) })}
                disabled={isRunning || !config.useMartingale}
                className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
              />
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.useMartingale}
                onCheckedChange={(checked) => setConfig({ ...config, useMartingale: checked })}
                disabled={isRunning}
              />
              <Label className={theme === "dark" ? "text-white" : "text-gray-900"}>Enable Martingale</Label>
            </div>

            {isRunning ? (
              <Button onClick={handleStop} variant="destructive" className="gap-2" disabled={isLoading}>
                <Square className="w-4 h-4" />
                Stop Bot
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                className="bg-green-500 hover:bg-green-600 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canStart}
              >
                {isLoading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start Bot
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Continuous Trading Analysis */}
      {isRunning && analysisData && (
        <Card
          className={
            theme === "dark"
              ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
              : "bg-white border-gray-200"
          }
        >
          <CardHeader>
            <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>
              Continuous Trading Analysis
            </CardTitle>
            <CardDescription className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
              Real-time proposal and market data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Current Market Data */}
              {analysisData.analysis && (
                <>
                  <div
                    className={`p-3 rounded-lg ${theme === "dark" ? "bg-blue-500/10 border border-blue-500/30" : "bg-blue-50 border border-blue-200"}`}
                  >
                    <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Current Price</p>
                    <p className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      ${analysisData.analysis.currentPrice?.toFixed(5)}
                    </p>
                    <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                      Last Digit: {analysisData.analysis.lastDigit}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-lg ${theme === "dark" ? "bg-purple-500/10 border border-purple-500/30" : "bg-purple-50 border border-purple-200"}`}
                  >
                    <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Contract Type</p>
                    <p className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {analysisData.analysis.contractType}
                    </p>
                    {analysisData.analysis.prediction && (
                      <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                        Prediction: {analysisData.analysis.prediction}
                      </p>
                    )}
                  </div>

                  <div
                    className={`p-3 rounded-lg ${theme === "dark" ? "bg-green-500/10 border border-green-500/30" : "bg-green-50 border border-green-200"}`}
                  >
                    <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Ask Price</p>
                    <p className={`text-lg font-bold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                      ${analysisData.analysis.proposal?.askPrice?.toFixed(2)}
                    </p>
                    <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                      Payout: ${analysisData.analysis.proposal?.payout?.toFixed(2)}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-lg ${theme === "dark" ? "bg-orange-500/10 border border-orange-500/30" : "bg-orange-50 border border-orange-200"}`}
                  >
                    <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Avg Probability</p>
                    <p className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {analysisData.proposalMetrics?.avgProbability?.toFixed(1)}%
                    </p>
                    <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                      Active Contracts: {analysisData.proposalMetrics?.totalProposals}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Proposal Longcode */}
            {analysisData.analysis?.proposal?.longcode && (
              <div
                className={`p-3 rounded-lg ${theme === "dark" ? "bg-gray-800 border border-gray-700" : "bg-gray-50 border border-gray-200"}`}
              >
                <p className={`text-xs font-semibold ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Contract Details
                </p>
                <p className={`text-sm mt-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  {analysisData.analysis.proposal.longcode}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bot Dashboard */}
      {botState && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              className={
                theme === "dark"
                  ? "bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/30"
                  : "bg-blue-50 border-blue-200"
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Total Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  {botState.totalRuns}
                </div>
                <div className={`text-sm mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {botState.wins}W / {botState.losses}L
                </div>
              </CardContent>
            </Card>

            <Card
              className={
                botState.profitLoss >= 0
                  ? theme === "dark"
                    ? "bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/30"
                    : "bg-green-50 border-green-200"
                  : theme === "dark"
                    ? "bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30"
                    : "bg-red-50 border-red-200"
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Profit/Loss
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold flex items-center gap-2 ${
                    botState.profitLoss >= 0
                      ? theme === "dark"
                        ? "text-green-400"
                        : "text-green-600"
                      : theme === "dark"
                        ? "text-red-400"
                        : "text-red-600"
                  }`}
                >
                  {botState.profitLoss >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                  ${Math.abs(botState.profitLoss).toFixed(2)}
                </div>
                <div className={`text-sm mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {botState.profitLossPercent.toFixed(2)}% of balance
                </div>
              </CardContent>
            </Card>

            <Card
              className={
                theme === "dark"
                  ? "bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/30"
                  : "bg-purple-50 border-purple-200"
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Win Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  {botState.totalRuns > 0 ? ((botState.wins / botState.totalRuns) * 100).toFixed(1) : "0"}%
                </div>
                <div className={`text-sm mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {botState.wins} wins
                </div>
              </CardContent>
            </Card>

            <Card
              className={
                theme === "dark"
                  ? "bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/30"
                  : "bg-orange-50 border-orange-200"
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Current Stake
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  ${botState.currentStake.toFixed(2)}
                </div>
                <div className={`text-sm mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {botState.consecutiveLosses} consecutive losses
                </div>
              </CardContent>
            </Card>
          </div>

          {/* TP/SL Progress */}
          <Card
            className={
              theme === "dark"
                ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
                : "bg-white border-gray-200"
            }
          >
            <CardHeader>
              <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>TP/SL Tracker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Take Profit Target: ${tpAmount.toFixed(2)}
                  </span>
                  <span className={`text-sm font-bold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                    {tpProgress.toFixed(1)}%
                  </span>
                </div>
                <Progress value={tpProgress} className="h-2 bg-gray-700">
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${tpProgress}%` }} />
                </Progress>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Stop Loss Limit: ${slAmount.toFixed(2)}
                  </span>
                  <span className={`text-sm font-bold ${theme === "dark" ? "text-red-400" : "text-red-600"}`}>
                    {slProgress.toFixed(1)}%
                  </span>
                </div>
                <Progress value={slProgress} className="h-2 bg-gray-700">
                  <div className="h-full bg-red-500 transition-all" style={{ width: `${slProgress}%` }} />
                </Progress>
              </div>
            </CardContent>
          </Card>

          {/* Trade Log */}
          <Card
            className={
              theme === "dark"
                ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
                : "bg-white border-gray-200"
            }
          >
            <CardHeader>
              <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>Trade Log</CardTitle>
              <CardDescription className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                Recent trades (last 50)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`border-b ${theme === "dark" ? "border-gray-700" : "border-gray-200"}`}>
                      <th className={`text-left p-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Time</th>
                      <th className={`text-left p-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                        Contract
                      </th>
                      <th className={`text-left p-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                        Result
                      </th>
                      <th className={`text-right p-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                        Stake
                      </th>
                      <th className={`text-right p-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {botState.trades.map((trade) => (
                      <tr
                        key={trade.id}
                        className={`border-b ${theme === "dark" ? "border-gray-800" : "border-gray-100"}`}
                      >
                        <td className={`p-2 text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          {new Date(trade.timestamp).toLocaleTimeString()}
                        </td>
                        <td className={`p-2 text-sm ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                          {trade.contract}
                        </td>
                        <td className="p-2">
                          <Badge
                            variant={trade.result === "WIN" ? "default" : "destructive"}
                            className={
                              trade.result === "WIN" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"
                            }
                          >
                            {trade.result}
                          </Badge>
                        </td>
                        <td
                          className={`p-2 text-sm text-right ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                        >
                          ${trade.stake.toFixed(2)}
                        </td>
                        <td
                          className={`p-2 text-sm text-right font-bold ${
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
        </>
      )}
    </div>
  )
}
