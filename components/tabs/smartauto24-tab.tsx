"use client"

import { useState, useRef, useEffect } from "react"
import { useDerivAPI } from "@/lib/deriv-api-context"
import { useDerivAuth } from "@/hooks/use-deriv-auth"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Play, Pause, Zap, AlertCircle, Eye, EyeOff } from "lucide-react"
import { DerivRealTrader } from "@/lib/deriv-real-trader"
import { EvenOddStrategy } from "@/lib/even-odd-strategy"
import { TradingJournal } from "@/lib/trading-journal"
import { TradeResultModal } from "@/components/modals/trade-result-modal"
import { TradingStrategies } from "@/lib/trading-strategies"
import { TradingStatsPanel } from "@/components/trading-stats-panel"
import { TransactionHistory } from "@/components/transaction-history"
import { TradingJournalPanel } from "@/components/trading-journal-panel"
import { TradeLog } from "@/components/trade-log"

interface AnalysisLogEntry {
  timestamp: Date
  message: string
  type: "info" | "success" | "warning"
}

interface BotStats {
  totalWins: number
  totalLosses: number
  totalProfit: number
  winRate: number
  totalStake: number
  totalPayout: number
  numberOfRuns: number
  contractsLost: number
  contractsWon: number
}

export function SmartAuto24Tab({ theme }: { theme: "light" | "dark" }) {
  const { apiClient, isConnected, isAuthorized } = useDerivAPI()
  const { balance, isLoggedIn, submitApiToken, token } = useDerivAuth()

  const [apiTokenInput, setApiTokenInput] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [tokenConnected, setTokenConnected] = useState(!!token)

  const [allMarkets, setAllMarkets] = useState<Array<{ symbol: string; display_name: string }>>([])
  const [loadingMarkets, setLoadingMarkets] = useState(true)

  // Configuration state
  const [market, setMarket] = useState("R_100")
  const [stake, setStake] = useState("0.35")
  const [targetProfit, setTargetProfit] = useState("1")
  const [analysisTimeMinutes, setAnalysisTimeMinutes] = useState("30")
  const [ticksForEntry, setTicksForEntry] = useState("36000")
  const [strategies] = useState<string[]>(["Even/Odd", "Over 3/Under 6", "Over 2/Under 7", "Differs"])
  const [selectedStrategy, setSelectedStrategy] = useState("Even/Odd")
  const strategiesRef = useRef<TradingStrategies>(new TradingStrategies())

  const [martingaleRatios, setMartingaleRatios] = useState<Record<string, number>>({
    "Even/Odd": 2.0,
    "Over 3/Under 6": 2.6,
    "Over 2/Under 7": 3.5,
    Differs: 2.3,
  })

  const [ticksPerTrade, setTicksPerTrade] = useState<number>(1)

  // Trading state
  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState<"idle" | "analyzing" | "trading" | "completed">("idle")
  const [sessionProfit, setSessionProfit] = useState(0)
  const [sessionTrades, setSessionTrades] = useState(0)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisLog, setAnalysisLog] = useState<AnalysisLogEntry[]>([])
  const [timeLeft, setTimeLeft] = useState(0)

  const [marketPrice, setMarketPrice] = useState<number | null>(null)
  const [lastDigit, setLastDigit] = useState<number | null>(null)

  // Analysis data
  const [digitFrequencies, setDigitFrequencies] = useState<number[]>(Array(10).fill(0))
  const [overUnderAnalysis, setOverUnderAnalysis] = useState({ over: 0, under: 0, total: 0 })
  const [ticksCollected, setTicksCollected] = useState(0)
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [showAnalysisResults, setShowAnalysisResults] = useState(false)

  const [differsWaitTicks, setDiffersWaitTicks] = useState(0)
  const [differsSelectedDigit, setDiffersSelectedDigit] = useState<number | null>(null)
  const [differsWaitingForEntry, setDiffersWaitingForEntry] = useState(false)
  const [differsTicksSinceAppearance, setDiffersTicksSinceAppearance] = useState(0)

  const [stats, setStats] = useState<BotStats>({
    totalWins: 0,
    totalLosses: 0,
    totalProfit: 0,
    winRate: 0,
    totalStake: 0,
    totalPayout: 0,
    numberOfRuns: 0,
    contractsLost: 0,
    contractsWon: 0,
  })

  const [tradeHistory, setTradeHistory] = useState<any[]>([])
  const [journalLog, setJournalLog] = useState<any[]>([])

  // Refs
  const traderRef = useRef<DerivRealTrader | null>(null)
  const strategyRef = useRef<EvenOddStrategy>(new EvenOddStrategy())
  const journalRef = useRef<TradingJournal>(new TradingJournal("smartauto24"))
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Modal state
  const [showResultModal, setShowResultModal] = useState(false)
  const [resultType, setResultType] = useState<"tp" | "sl">("tp")
  const [resultAmount, setResultAmount] = useState(0)

  useEffect(() => {
    if (!apiClient || !isConnected || !isAuthorized) return

    const loadMarkets = async () => {
      try {
        setLoadingMarkets(true)
        const symbols = await apiClient.getActiveSymbols()
        setAllMarkets(symbols)
        console.log("[v0] Loaded all markets:", symbols.length)
      } catch (error) {
        console.error("[v0] Failed to load markets:", error)
      } finally {
        setLoadingMarkets(false)
      }
    }

    loadMarkets()
  }, [apiClient, isConnected, isAuthorized])

  useEffect(() => {
    if (!apiClient || !isConnected || !market) return

    let tickSubscriptionId: string | null = null

    const subscribeTicks = async () => {
      try {
        tickSubscriptionId = await apiClient.subscribeTicks(market, (tick) => {
          setMarketPrice(tick.quote)
          const digit = Math.floor(tick.quote * 10) % 10
          setLastDigit(digit)

          // Update digit frequencies
          setDigitFrequencies((prev) => {
            const newFreq = [...prev]
            newFreq[digit]++
            return newFreq
          })

          // Update over/under
          setOverUnderAnalysis((prev) => {
            const isOver = digit >= 5
            return {
              over: prev.over + (isOver ? 1 : 0),
              under: prev.under + (isOver ? 0 : 1),
              total: prev.total + 1,
            }
          })

          setTicksCollected((prev) => prev + 1)

          if (differsWaitingForEntry && differsSelectedDigit !== null) {
            if (digit === differsSelectedDigit) {
              // Reset if selected digit appears
              setDiffersTicksSinceAppearance(0)
            } else {
              // Increment ticks since appearance
              setDiffersTicksSinceAppearance((prev) => prev + 1)
            }
          }
        })
      } catch (error) {
        console.error("[v0] Failed to subscribe to ticks:", error)
      }
    }

    subscribeTicks()

    return () => {
      if (tickSubscriptionId) {
        apiClient.forget(tickSubscriptionId).catch((err) => console.log("[v0] Forget error:", err))
      }
    }
  }, [apiClient, isConnected, market, differsWaitingForEntry, differsSelectedDigit])

  useEffect(() => {
    const savedToken = localStorage.getItem("deriv_api_token_smartauto24")
    if (savedToken && !tokenConnected) {
      setApiTokenInput(savedToken)
      handleConnectToken(savedToken)
    }
  }, [])

  const addAnalysisLog = (message: string, type: "info" | "success" | "warning" = "info") => {
    setAnalysisLog((prev) => [
      {
        timestamp: new Date(),
        message,
        type,
      },
      ...prev.slice(0, 99),
    ])
  }

  const handleConnectToken = async (tokenToUse?: string) => {
    const tokenValue = tokenToUse || apiTokenInput
    if (!tokenValue) {
      addAnalysisLog("API token cannot be empty.", "warning")
      return
    }
    try {
      await submitApiToken(tokenValue)
      setTokenConnected(true)
      addAnalysisLog("API token connected successfully.", "success")
      localStorage.setItem("deriv_api_token_smartauto24", tokenValue)
    } catch (error) {
      console.error("Failed to connect token:", error)
      addAnalysisLog(`Failed to connect token: ${error}`, "warning")
    }
  }

  const handleStartAnalysis = async () => {
    if (!isLoggedIn || !apiClient || !isConnected) {
      addAnalysisLog("Not logged in or API not ready", "warning")
      return
    }

    setIsRunning(true)
    setStatus("analyzing")
    setAnalysisProgress(0)
    setTimeLeft(Number.parseInt(analysisTimeMinutes) * 60)
    setDigitFrequencies(Array(10).fill(0))
    setOverUnderAnalysis({ over: 0, under: 0, total: 0 })
    setTicksCollected(0)
    // Reset Differs strategy state
    setDiffersSelectedDigit(null)
    setDiffersWaitingForEntry(false)
    setDiffersTicksSinceAppearance(0)

    addAnalysisLog(`Starting ${analysisTimeMinutes} minute analysis on ${market}...`, "info")

    // Initialize trader
    traderRef.current = new DerivRealTrader(apiClient)

    // Start timer
    const analysisSeconds = Number.parseInt(analysisTimeMinutes) * 60
    let secondsElapsed = 0

    timerIntervalRef.current = setInterval(() => {
      secondsElapsed++
      setTimeLeft(Math.max(0, analysisSeconds - secondsElapsed))
      setAnalysisProgress((secondsElapsed / analysisSeconds) * 100)

      if (secondsElapsed >= analysisSeconds) {
        clearInterval(timerIntervalRef.current!)
        completeAnalysis()
      }
    }, 1000)
  }

  const completeAnalysis = async () => {
    setStatus("trading")
    addAnalysisLog("Analysis complete! Analyzing with selected strategy...", "success")

    const recentDigits: number[] = []
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < digitFrequencies[i]; j++) {
        recentDigits.push(i)
      }
    }

    let analysis: any = null
    if (selectedStrategy === "Differs") {
      analysis = await analyzeDiffersStrategy(recentDigits)
      if (!analysis) {
        addAnalysisLog("Differs strategy: No suitable digit found. Stopping.", "warning")
        setIsRunning(false)
        setStatus("idle")
        return
      }
    } else if (selectedStrategy === "Even/Odd") {
      analysis = strategiesRef.current!.analyzeEvenOdd(recentDigits)
    } else if (selectedStrategy === "Over 3/Under 6") {
      analysis = strategiesRef.current!.analyzeOver3Under6(recentDigits)
    } else if (selectedStrategy === "Over 2/Under 7") {
      analysis = strategiesRef.current!.analyzeOver2Under7(recentDigits)
    }

    setAnalysisData({
      strategy: selectedStrategy,
      power: analysis.power,
      signal: analysis.signal,
      confidence: analysis.confidence,
      description: analysis.description,
      digitFrequencies,
      ticksCollected,
      differsDigit: selectedStrategy === "Differs" ? differsSelectedDigit : undefined,
    })
    setShowAnalysisResults(true)

    if (!analysis.signal) {
      addAnalysisLog(`Power ${analysis.power.toFixed(1)}% below 55% threshold. Stopping.`, "warning")
      setIsRunning(false)
      setStatus("idle")
      return
    }

    addAnalysisLog(`${selectedStrategy} Power: ${analysis.power.toFixed(1)}% - Signal: ${analysis.signal}`, "success")

    if (selectedStrategy === "Differs" && differsSelectedDigit !== null) {
      setDiffersWaitingForEntry(true)
      setDiffersTicksSinceAppearance(0)
      addAnalysisLog(`Waiting for digit ${differsSelectedDigit} to appear, then watching next 3 ticks...`, "info")

      // Monitor for entry condition
      const checkEntryInterval = setInterval(() => {
        if (differsTicksSinceAppearance >= 3) {
          clearInterval(checkEntryInterval)
          setDiffersWaitingForEntry(false)
          addAnalysisLog(
            `Entry condition met! Digit ${differsSelectedDigit} didn't appear in 3 ticks. Starting trades.`,
            "success",
          )
          startDiffersTrades(analysis)
        }
      }, 1000)

      return
    }

    // Execute trades for other strategies
    executeTrades(analysis)
  }

  const analyzeDiffersStrategy = async (recentDigits: number[]) => {
    const total = recentDigits.length
    const frequencies = Array(10).fill(0)

    recentDigits.forEach((d) => frequencies[d]++)

    // Calculate percentages
    const percentages = frequencies.map((f) => (f / total) * 100)

    // Find most and least appearing
    const maxFreq = Math.max(...frequencies)
    const minFreq = Math.min(...frequencies)
    const mostAppearing = frequencies.indexOf(maxFreq)
    const leastAppearing = frequencies.indexOf(minFreq)

    // Find suitable digit (2-7, not most/least, <10% power, decreasing)
    let selectedDigit: number | null = null
    let selectedPower = 0

    for (let digit = 2; digit <= 7; digit++) {
      const power = percentages[digit]

      // Skip if most or least appearing
      if (digit === mostAppearing || digit === leastAppearing) continue

      // Must have less than 10% power
      if (power >= 10) continue

      // Check if decreasing (compare last 20% of data vs first 80%)
      const splitPoint = Math.floor(recentDigits.length * 0.8)
      const firstPart = recentDigits.slice(0, splitPoint).filter((d) => d === digit).length
      const lastPart = recentDigits.slice(splitPoint).filter((d) => d === digit).length

      const firstPartPercent = (firstPart / splitPoint) * 100
      const lastPartPercent = (lastPart / (recentDigits.length - splitPoint)) * 100

      // Must be decreasing (last part < first part)
      if (lastPartPercent >= firstPartPercent) continue

      // Found suitable digit
      selectedDigit = digit
      selectedPower = power
      break
    }

    if (selectedDigit === null) {
      return null
    }

    setDiffersSelectedDigit(selectedDigit)

    addAnalysisLog(
      `Selected digit ${selectedDigit} with ${selectedPower.toFixed(1)}% power (decreasing trend)`,
      "success",
    )

    return {
      signal: "DIFFERS",
      power: 100 - selectedPower, // Invert power (lower frequency = higher power for differs)
      confidence: 75,
      description: `Differs strategy targeting digit ${selectedDigit} with ${selectedPower.toFixed(1)}% appearance rate (decreasing).`,
    }
  }

  const startDiffersTrades = (analysis: any) => {
    executeTrades(analysis)
  }

  const executeTrades = (analysis: any) => {
    let tradesExecuted = 0

    analysisIntervalRef.current = setInterval(async () => {
      if (!traderRef.current) {
        clearInterval(analysisIntervalRef.current!)
        setStatus("completed")
        addAnalysisLog("Trading stopped.", "info")
        setIsRunning(false)
        return
      }

      try {
        let contractType: string
        let barrier: string | undefined = undefined

        if (selectedStrategy === "Differs" && differsSelectedDigit !== null) {
          contractType = "DIGITDIFF"
          barrier = differsSelectedDigit.toString()
        } else if (selectedStrategy === "Even/Odd") {
          contractType = analysis.signal === "EVEN" ? "DIGITEVEN" : "DIGITODD"
        } else if (selectedStrategy === "Over 3/Under 6") {
          if (analysis.signal === "OVER" || analysis.signal.includes("OVER")) {
            contractType = "DIGITOVER"
            barrier = "3"
          } else {
            contractType = "DIGITUNDER"
            barrier = "6"
          }
        } else if (selectedStrategy === "Over 2/Under 7") {
          if (analysis.signal === "OVER" || analysis.signal.includes("OVER")) {
            contractType = "DIGITOVER"
            barrier = "2"
          } else {
            contractType = "DIGITUNDER"
            barrier = "7"
          }
        } else {
          contractType = analysis.signal === "BUY" ? "CALL" : "PUT"
        }

        const martingaleMultiplier = martingaleRatios[selectedStrategy] || 2.0
        const baseStake = Number.parseFloat(stake)
        const martingaleStake =
          tradesExecuted > 0 ? baseStake * Math.pow(martingaleMultiplier, tradesExecuted - 1) : baseStake

        const adjustedStake = Math.round(martingaleStake * 100) / 100

        addAnalysisLog(
          `Tick ${tradesExecuted + 1}: ${marketPrice?.toFixed(5)} (Digit: ${lastDigit}) - Executing trade...`,
          "info",
        )

        const tradeConfig: any = {
          symbol: market,
          contractType: contractType,
          stake: adjustedStake.toFixed(2),
          duration: ticksPerTrade,
          durationUnit: "t",
        }

        if (barrier !== undefined) {
          tradeConfig.barrier = barrier
        }

        console.log(`[v0] Executing trade with config:`, tradeConfig)

        const result = await traderRef.current!.executeTrade(tradeConfig)

        if (result) {
          tradesExecuted++
          setSessionTrades(tradesExecuted)
          setSessionProfit(traderRef.current!.getTotalProfit())

          setStats((prev) => {
            const newStats = { ...prev }
            newStats.numberOfRuns++
            newStats.totalStake += adjustedStake
            newStats.totalPayout += result.payout || 0

            if (result.isWin) {
              newStats.totalWins++
              newStats.contractsWon++
              newStats.totalProfit += result.profit || 0
            } else {
              newStats.totalLosses++
              newStats.contractsLost++
              newStats.totalProfit -= adjustedStake
            }

            newStats.winRate = (newStats.totalWins / newStats.numberOfRuns) * 100

            return newStats
          })

          setTradeHistory((prev) => [
            {
              id: result.contractId?.toString() || `trade-${Date.now()}`,
              contractType: selectedStrategy === "Differs" ? `DIFFERS ${differsSelectedDigit}` : contractType,
              market,
              entrySpot: result.entrySpot?.toString() || "N/A",
              exitSpot: result.exitSpot?.toString() || "N/A",
              buyPrice: adjustedStake,
              profitLoss: result.profit || 0,
              timestamp: Date.now(),
              status: result.isWin ? "win" : "loss",
            },
            ...prev,
          ])

          journalRef.current!.addEntry({
            type: "TRADE",
            action: result.isWin ? "WIN" : "LOSS",
            stake: adjustedStake,
            profit: result.profit,
            contractType: contractType,
            market,
            strategy: selectedStrategy,
          })

          addAnalysisLog(
            `Trade ${tradesExecuted}: ${result.isWin ? "WIN" : "LOSS"} - P/L: $${(result.profit || 0).toFixed(2)} (Martingale: ${martingaleMultiplier.toFixed(1)}x)`,
            result.isWin ? "success" : "warning",
          )

          if (traderRef.current!.getTotalProfit() >= Number.parseFloat(targetProfit)) {
            setResultType("tp")
            setResultAmount(traderRef.current!.getTotalProfit())
            setShowResultModal(true)
            clearInterval(analysisIntervalRef.current!)
            setIsRunning(false)
            setStatus("completed")
            addAnalysisLog("Take Profit hit! Session complete.", "success")
          }
        }
      } catch (error: any) {
        console.error("[v0] Trade execution error:", error)
        addAnalysisLog(`Trade error: ${error.message}`, "warning")
      }
    }, 3000) // 3 second interval between trades
  }

  const handleStopTrading = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current)
    setIsRunning(false)
    setStatus("idle")
    addAnalysisLog("Trading stopped", "info")
  }

  return (
    <div className="space-y-4">
      {!tokenConnected ? (
        <Card
          className={`p-6 border ${
            theme === "dark"
              ? "bg-gradient-to-r from-red-500/20 via-orange-500/20 to-yellow-500/20 border-red-500/30"
              : "bg-gradient-to-r from-red-50 to-orange-50 border-red-200"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <AlertCircle className={`w-6 h-6 ${theme === "dark" ? "text-red-400" : "text-red-600"}`} />
              <div>
                <h3 className={`text-lg font-bold ${theme === "dark" ? "text-red-400" : "text-red-700"}`}>
                  Connect API Token
                </h3>
                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Enter your Deriv API token to start trading
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <label
                className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
              >
                API Token
              </label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={apiTokenInput}
                  onChange={(e) => setApiTokenInput(e.target.value)}
                  placeholder="Paste your Deriv API token here..."
                  className={`pr-10 ${
                    theme === "dark"
                      ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${theme === "dark" ? "text-gray-400 hover:text-gray-300" : "text-gray-600 hover:text-gray-900"}`}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              onClick={() => handleConnectToken()}
              className={`w-full ${
                theme === "dark"
                  ? "bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-black font-bold"
                  : "bg-yellow-500 hover:bg-yellow-600 text-white font-bold"
              }`}
            >
              <Zap className="w-4 h-4 mr-2" />
              Connect Token
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card
            className={`p-6 border ${
              theme === "dark"
                ? "bg-gradient-to-r from-green-500/20 via-emerald-500/20 to-teal-500/20 border-green-500/30"
                : "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Account Balance</p>
                <h3 className={`text-3xl font-bold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                  ${balance?.amount.toFixed(2) || "0.00"}
                </h3>
                <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                  {balance?.currency || "USD"}
                </p>
              </div>
              <Badge
                className={`text-lg px-4 py-2 ${
                  theme === "dark"
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : "bg-green-100 text-green-700"
                }`}
              >
                Connected
              </Badge>
            </div>
          </Card>

          {marketPrice !== null && (
            <Card
              className={`p-6 border ${
                theme === "dark"
                  ? "bg-gradient-to-r from-blue-500/20 via-cyan-500/20 to-teal-500/20 border-blue-500/30"
                  : "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Current Market Price - {allMarkets.find((m) => m.symbol === market)?.display_name || market}
                  </p>
                  <h3 className={`text-3xl font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                    {marketPrice.toFixed(4)}
                  </h3>
                  <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                    Last Digit: {lastDigit !== null ? lastDigit : "N/A"} | Ticks: {ticksCollected}
                  </p>
                </div>
                <Badge
                  className={`text-lg px-4 py-2 ${
                    theme === "dark" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  Live
                </Badge>
              </div>
            </Card>
          )}

          {showAnalysisResults && analysisData && (
            <Card
              className={`p-6 border ${
                theme === "dark"
                  ? "bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30"
                  : "bg-purple-50 border-purple-200"
              }`}
            >
              <h3 className={`text-lg font-bold mb-4 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                Analysis Results - {analysisData.strategy}
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div
                  className={`p-4 rounded-lg ${
                    theme === "dark" ? "bg-blue-500/10 border border-blue-500/30" : "bg-blue-50 border border-blue-200"
                  }`}
                >
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Power</div>
                  <div className={`text-2xl font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                    {analysisData.power.toFixed(1)}%
                  </div>
                </div>

                <div
                  className={`p-4 rounded-lg ${
                    theme === "dark"
                      ? "bg-green-500/10 border border-green-500/30"
                      : "bg-green-50 border border-green-200"
                  }`}
                >
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Signal</div>
                  <div className={`text-2xl font-bold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                    {analysisData.signal}
                  </div>
                </div>

                <div
                  className={`p-4 rounded-lg ${
                    theme === "dark"
                      ? "bg-yellow-500/10 border border-yellow-500/30"
                      : "bg-yellow-50 border border-yellow-200"
                  }`}
                >
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Confidence</div>
                  <div className={`text-2xl font-bold ${theme === "dark" ? "text-yellow-400" : "text-yellow-600"}`}>
                    {analysisData.confidence.toFixed(1)}%
                  </div>
                </div>

                <div
                  className={`p-4 rounded-lg ${
                    theme === "dark"
                      ? "bg-purple-500/10 border border-purple-500/30"
                      : "bg-purple-50 border border-purple-200"
                  }`}
                >
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Ticks</div>
                  <div className={`text-2xl font-bold ${theme === "dark" ? "text-purple-400" : "text-purple-600"}`}>
                    {analysisData.ticksCollected}
                  </div>
                </div>
              </div>

              <div
                className={`p-4 rounded-lg ${
                  theme === "dark" ? "bg-gray-900/50 border border-gray-700" : "bg-gray-100 border border-gray-300"
                }`}
              >
                <p className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  {analysisData.description}
                </p>
              </div>
            </Card>
          )}

          {/* Configuration Panel */}
          <Card
            className={`p-6 border ${
              theme === "dark"
                ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-yellow-500/20"
                : "bg-white border-gray-200"
            }`}
          >
            <h3 className={`text-lg font-bold mb-4 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              Configuration
            </h3>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Market
                </label>
                <Select value={market} onValueChange={setMarket} disabled={loadingMarkets}>
                  <SelectTrigger
                    className={`${
                      theme === "dark"
                        ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={theme === "dark" ? "bg-[#0a0e27] border-yellow-500/30" : "bg-white"}>
                    {allMarkets.map((m) => (
                      <SelectItem key={m.symbol} value={m.symbol}>
                        {m.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Analysis Time (Minutes)
                </label>
                <Input
                  type="number"
                  value={analysisTimeMinutes}
                  onChange={(e) => setAnalysisTimeMinutes(e.target.value)}
                  className={`${
                    theme === "dark"
                      ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                  min="1"
                  max="120"
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Ticks for Entry
                </label>
                <Input
                  type="number"
                  value={ticksForEntry}
                  onChange={(e) => setTicksForEntry(e.target.value)}
                  className={`${
                    theme === "dark"
                      ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                  min="100"
                  step="100"
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Stake ($)
                </label>
                <Input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className={`${
                    theme === "dark"
                      ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                  step="0.01"
                  min="0.01"
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Target Profit ($)
                </label>
                <Input
                  type="number"
                  value={targetProfit}
                  onChange={(e) => setTargetProfit(e.target.value)}
                  className={`${
                    theme === "dark"
                      ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                  step="0.1"
                  min="0.1"
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Strategy
                </label>
                <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                  <SelectTrigger
                    className={`${
                      theme === "dark"
                        ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={theme === "dark" ? "bg-[#0a0e27] border-yellow-500/30" : "bg-white"}>
                    {strategies.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Martingale Multiplier
                </label>
                <Input
                  type="number"
                  value={martingaleRatios[selectedStrategy] || 2.0}
                  onChange={(e) => {
                    const newRatio = Number.parseFloat(e.target.value) || 2.0
                    setMartingaleRatios((prev) => ({ ...prev, [selectedStrategy]: newRatio }))
                  }}
                  className={`${
                    theme === "dark"
                      ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                  step="0.1"
                  min="1.5"
                  max="5"
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Ticks Per Trade
                </label>
                <Input
                  type="number"
                  value={ticksPerTrade}
                  onChange={(e) => setTicksPerTrade(Number.parseInt(e.target.value))}
                  className={`${
                    theme === "dark"
                      ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                  min="1"
                  max="100"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleStartAnalysis}
                disabled={isRunning || !isLoggedIn || loadingMarkets}
                className={`flex-1 ${
                  theme === "dark"
                    ? "bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-black font-bold"
                    : "bg-yellow-500 hover:bg-yellow-600 text-white font-bold"
                }`}
              >
                <Play className="w-4 h-4 mr-2" />
                Start Analysis
              </Button>

              <Button
                onClick={handleStopTrading}
                disabled={!isRunning}
                variant="destructive"
                className={`flex-1 ${theme === "dark" ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-300 text-red-600"}`}
              >
                <Pause className="w-4 h-4 mr-2" />
                Stop
              </Button>
            </div>
          </Card>

          {/* Analysis Progress */}
          {status === "analyzing" && (
            <Card
              className={`p-6 border ${
                theme === "dark"
                  ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-yellow-500/20"
                  : "bg-white border-gray-200"
              }`}
            >
              <h3 className={`text-lg font-bold mb-6 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                Analysis in Progress
              </h3>

              <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                  <span className={`text-sm font-medium ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                    Time Left: {Math.floor(timeLeft / 60)}m {timeLeft % 60}s
                  </span>
                  <span className={`text-sm font-bold ${theme === "dark" ? "text-yellow-400" : "text-yellow-600"}`}>
                    {analysisProgress.toFixed(0)}%
                  </span>
                </div>
                <div
                  className={`w-full h-4 rounded-full overflow-hidden ${theme === "dark" ? "bg-gray-700" : "bg-gray-200"}`}
                >
                  <div
                    className="h-full bg-gradient-to-r from-yellow-500 to-amber-500 transition-all duration-300"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>
              </div>

              {/* Analysis Log */}
              <div
                className={`p-4 rounded-lg ${
                  theme === "dark" ? "bg-gray-900/50 border border-gray-700" : "bg-gray-900 border border-gray-800"
                }`}
              >
                <h4 className={`text-sm font-bold mb-3 ${theme === "dark" ? "text-gray-300" : "text-gray-300"}`}>
                  Analysis Log
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
                  {analysisLog.length === 0 ? (
                    <div className="text-gray-500">Waiting for analysis to start...</div>
                  ) : (
                    analysisLog.map((log, idx) => (
                      <div
                        key={idx}
                        className={`${
                          log.type === "success"
                            ? "text-green-400"
                            : log.type === "warning"
                              ? "text-yellow-400"
                              : "text-gray-400"
                        }`}
                      >
                        <span className="text-gray-600">[{log.timestamp.toLocaleTimeString()}]</span> {log.message}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Stats Panel */}
          <TradingStatsPanel
            stats={stats}
            theme={theme}
            onReset={() => {
              setStats({
                totalWins: 0,
                totalLosses: 0,
                totalProfit: 0,
                winRate: 0,
                totalStake: 0,
                totalPayout: 0,
                numberOfRuns: 0,
                contractsLost: 0,
                contractsWon: 0,
              })
              setTradeHistory([])
              setJournalLog([])
            }}
          />

          {/* Transaction History */}
          {tradeHistory.length > 0 && <TransactionHistory transactions={tradeHistory} theme={theme} />}

          {/* Trade Log */}
          {tradeHistory.length > 0 && (
            <TradeLog
              trades={tradeHistory.map((trade) => ({
                id: trade.id,
                timestamp: trade.timestamp,
                volume: "1",
                tradeType: selectedStrategy,
                contractType: trade.contractType,
                predicted: analysisData?.signal || "N/A",
                result: trade.status,
                entry: trade.entrySpot,
                exit: trade.exitSpot,
                stake: trade.buyPrice,
                profitLoss: trade.profitLoss,
              }))}
              theme={theme}
            />
          )}

          {/* Journal */}
          {journalLog.length > 0 && <TradingJournalPanel entries={journalLog} theme={theme} />}

          {/* Session Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              className={`p-6 border ${
                theme === "dark"
                  ? "bg-gradient-to-br from-green-500/10 to-green-500/10 border-green-500/30"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Session Profit</div>
              <div
                className={`text-3xl font-bold ${sessionProfit >= 0 ? (theme === "dark" ? "text-green-400" : "text-green-600") : theme === "dark" ? "text-red-400" : "text-red-600"}`}
              >
                {sessionProfit >= 0 ? "+" : ""} ${sessionProfit.toFixed(2)}
              </div>
            </Card>

            <Card
              className={`p-6 border ${
                theme === "dark"
                  ? "bg-gradient-to-br from-blue-500/10 to-blue-500/10 border-blue-500/30"
                  : "bg-blue-50 border-blue-200"
              }`}
            >
              <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Trades Executed</div>
              <div className={`text-3xl font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                {sessionTrades}
              </div>
            </Card>

            <Card
              className={`p-6 border ${
                theme === "dark"
                  ? "bg-gradient-to-br from-yellow-500/10 to-yellow-500/10 border-yellow-500/30"
                  : "bg-yellow-50 border-yellow-200"
              }`}
            >
              <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Status</div>
              <div className={`text-lg font-bold ${theme === "dark" ? "text-yellow-400" : "text-yellow-600"}`}>
                {status.toUpperCase()}
              </div>
            </Card>
          </div>
        </>
      )}

      <TradeResultModal
        isOpen={showResultModal}
        type={resultType}
        amount={resultAmount}
        theme={theme}
        onClose={() => setShowResultModal(false)}
      />
    </div>
  )
}
