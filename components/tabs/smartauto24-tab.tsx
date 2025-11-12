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
  const [strategies] = useState<string[]>(["Even/Odd", "Over 3/Under 6", "Over 2/Under 7"]) // Removed Differs Pro from strategies list
  const [selectedStrategy, setSelectedStrategy] = useState("Even/Odd")
  const strategiesRef = useRef<TradingStrategies>(new TradingStrategies())

  const [martingaleRatios, setMartingaleRatios] = useState<Record<string, number>>({
    "Even/Odd": 2.0,
    "Over 3/Under 6": 2.6,
    "Over 2/Under 7": 3.5,
  })

  const [ticksPerTrade, setTicksPerTrade] = useState<number>(5)

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
  const [lastDigits, setLastDigits] = useState<number[]>([])

  // Analysis data
  const [digitFrequencies, setDigitFrequencies] = useState<number[]>(Array(10).fill(0))
  const [overUnderAnalysis, setOverUnderAnalysis] = useState({ over: 0, under: 0, total: 0 })
  const [ticksCollected, setTicksCollected] = useState(0)
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [showAnalysisResults, setShowAnalysisResults] = useState(false)

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

  const [differsProState, setDiffersProState] = useState<{
    selectedDigit: number | null
    digitAppeared: boolean
    ticksAfterAppearance: number
    isPaused: boolean
  }>({
    selectedDigit: null,
    digitAppeared: false,
    ticksAfterAppearance: 0,
    isPaused: false,
  })

  useEffect(() => {
    if (!apiClient || !isConnected || !isAuthorized) return

    let isSubscribed = true
    const loadMarkets = async () => {
      try {
        if (!isSubscribed) return
        setLoadingMarkets(true)
        const symbols = await apiClient.getActiveSymbols()
        if (isSubscribed) {
          setAllMarkets(symbols)
        }
      } catch (error) {
        console.error("[v0] SmartAuto24: Failed to load markets:", error)
      } finally {
        if (isSubscribed) {
          setLoadingMarkets(false)
        }
      }
    }

    loadMarkets()

    return () => {
      isSubscribed = false
    }
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

          setDigitFrequencies((prev) => {
            const newFreq = [...prev]
            newFreq[digit]++
            return newFreq
          })

          setOverUnderAnalysis((prev) => {
            const isOver = digit >= 5
            return {
              over: prev.over + (isOver ? 1 : 0),
              under: prev.under + (isOver ? 0 : 1),
              total: prev.total + 1,
            }
          })

          setTicksCollected((prev) => prev + 1)
          setLastDigits((prev) => [...prev, digit].slice(-20))
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
  }, [apiClient, isConnected, market])

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
    setLastDigits([])
    setDiffersProState({
      selectedDigit: null,
      digitAppeared: false,
      ticksAfterAppearance: 0,
      isPaused: false,
    })

    addAnalysisLog(`Starting ${analysisTimeMinutes} minute analysis on ${market}...`, "info")

    traderRef.current = new DerivRealTrader(apiClient)

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

  const analyzeDiffersPro = (recentDigits: number[]): any => {
    const digitCounts: number[] = Array(10).fill(0)
    recentDigits.forEach((digit) => digitCounts[digit]++)

    const totalDigits = recentDigits.length
    const digitPercentages = digitCounts.map((count) => (count / totalDigits) * 100)

    const mostAppearing = digitPercentages.indexOf(Math.max(...digitPercentages))
    const leastAppearing = digitPercentages.indexOf(Math.min(...digitPercentages))

    const validDigits: number[] = []

    for (let digit = 2; digit <= 7; digit++) {
      if (digit === mostAppearing || digit === leastAppearing) continue
      if (digitPercentages[digit] >= 10) continue

      const last10 = recentDigits.slice(-10).filter((d) => d === digit).length
      const last20 = recentDigits.slice(-20).filter((d) => d === digit).length

      const percent10 = (last10 / Math.min(10, recentDigits.length)) * 100
      const percent20 = (last20 / Math.min(20, recentDigits.length)) * 100

      if (percent10 < percent20) {
        validDigits.push(digit)
      }
    }

    if (validDigits.length === 0) {
      return {
        power: 0,
        signal: null,
        confidence: 0,
        description:
          "No valid Differs Pro digits found (need digits 2-7, not most/least appearing, <10% power, decreasing)",
        targetDigit: null,
      }
    }

    const selectedDigit = validDigits.reduce((best, digit) =>
      digitPercentages[digit] < digitPercentages[best] ? digit : best,
    )

    const power = 100 - digitPercentages[selectedDigit]

    return {
      power,
      signal: "DIFFERS",
      confidence: power,
      description: `Differs Pro: Target digit ${selectedDigit} (${digitPercentages[selectedDigit].toFixed(1)}% power, decreasing)`,
      targetDigit: selectedDigit,
    }
  }

  const completeAnalysis = async () => {
    setStatus("trading")
    addAnalysisLog("Analysis complete! Analyzing with selected strategy...", "success")

    console.log("[v0] SmartAuto24: Starting analysis completion")

    const recentDigits: number[] = []
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < digitFrequencies[i]; j++) {
        recentDigits.push(i)
      }
    }

    console.log("[v0] SmartAuto24: Recent digits collected:", recentDigits.length)

    let analysis: any = null
    if (selectedStrategy === "Even/Odd") {
      analysis = strategiesRef.current!.analyzeEvenOdd(recentDigits)
    } else if (selectedStrategy === "Over 3/Under 6") {
      analysis = strategiesRef.current!.analyzeOver3Under6(recentDigits)
    } else if (selectedStrategy === "Over 2/Under 7") {
      analysis = strategiesRef.current!.analyzeOver2Under7(recentDigits)
    }

    console.log("[v0] SmartAuto24: Analysis result:", analysis)

    setAnalysisData({
      strategy: selectedStrategy,
      power: analysis.power,
      signal: analysis.signal,
      confidence: analysis.confidence,
      description: analysis.description,
      digitFrequencies,
      ticksCollected,
    })
    setShowAnalysisResults(true)

    if (!analysis.signal) {
      addAnalysisLog(`Power ${analysis.power.toFixed(1)}% below threshold. Stopping.`, "warning")
      console.log("[v0] SmartAuto24: No signal found, stopping bot")
      setIsRunning(false)
      setStatus("idle")
      return
    }

    addAnalysisLog(`${selectedStrategy} Power: ${analysis.power.toFixed(1)}% - Signal: ${analysis.signal}`, "success")
    addAnalysisLog(`🤖 Starting AUTOTRADE mode with ${selectedStrategy} strategy...`, "info")

    console.log("[v0] SmartAuto24: Starting auto-trade with signal:", analysis.signal)

    let tradesExecuted = 0

    const executeTrade = async () => {
      if (!traderRef.current || !isRunning) {
        console.log("[v0] SmartAuto24: Trading stopped - trader not available or bot not running")
        if (analysisIntervalRef.current) {
          clearInterval(analysisIntervalRef.current)
        }
        setStatus("completed")
        addAnalysisLog("Trading session ended.", "info")
        setIsRunning(false)
        return false
      }

      try {
        const contractType = analysis.signal === "BUY" ? "CALL" : analysis.signal === "SELL" ? "PUT" : analysis.signal

        const martingaleMultiplier = martingaleRatios[selectedStrategy] || 2.0
        const baseStake = Number.parseFloat(stake)
        const martingaleStake =
          tradesExecuted > 0 ? baseStake * Math.pow(martingaleMultiplier, tradesExecuted) : baseStake

        const adjustedStake = Math.round(martingaleStake * 100) / 100

        console.log("[v0] SmartAuto24: Executing trade", {
          tradeNumber: tradesExecuted + 1,
          contractType,
          stake: adjustedStake,
          market,
        })

        addAnalysisLog(
          `🎯 AutoTrade ${tradesExecuted + 1}: ${contractType} on ${market} with stake $${adjustedStake}`,
          "info",
        )

        const tradeConfig: any = {
          symbol: market,
          contractType: contractType,
          stake: adjustedStake.toFixed(2),
          duration: ticksPerTrade,
          durationUnit: "t",
        }

        console.log("[v0] SmartAuto24: Trade config:", tradeConfig)

        const result = await traderRef.current!.executeTrade(tradeConfig)

        console.log("[v0] SmartAuto24: Trade result received:", result)

        if (result) {
          tradesExecuted++
          setSessionTrades(tradesExecuted)
          const currentProfit = traderRef.current!.getTotalProfit()
          setSessionProfit(currentProfit)

          console.log("[v0] SmartAuto24: Trade completed", {
            isWin: result.isWin,
            profit: result.profit,
            totalProfit: currentProfit,
          })

          setStats((prev) => {
            const newStats = { ...prev }
            newStats.numberOfRuns++
            newStats.totalStake += adjustedStake

            if (result.isWin) {
              newStats.totalWins++
              newStats.contractsWon++
              newStats.totalProfit += result.profit
              newStats.totalPayout += result.payout
            } else {
              newStats.totalLosses++
              newStats.contractsLost++
              newStats.totalProfit += result.profit
              newStats.totalPayout += result.payout
            }

            newStats.winRate = newStats.numberOfRuns > 0 ? (newStats.totalWins / newStats.numberOfRuns) * 100 : 0

            return newStats
          })

          setTradeHistory((prev) => [
            {
              id: result.contractId?.toString() || `trade-${Date.now()}`,
              contractType: contractType,
              market,
              entrySpot: result.entrySpot?.toString() || "N/A",
              exitSpot: result.exitSpot?.toString() || "N/A",
              buyPrice: adjustedStake,
              profitLoss: result.profit,
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
            `AutoTrade ${tradesExecuted}: ${result.isWin ? "✅ WIN" : "❌ LOSS"} - P&L: ${result.isWin ? "+" : ""}${result.profit.toFixed(2)} | Balance: $${(balance?.amount || 0).toFixed(2)}`,
            result.isWin ? "success" : "warning",
          )

          if (result.isWin) {
            tradesExecuted = 0
            addAnalysisLog("🔄 Win detected! Resetting to base stake...", "success")
            console.log("[v0] SmartAuto24: Win detected, resetting martingale")
          }

          if (currentProfit >= Number.parseFloat(targetProfit)) {
            setResultType("tp")
            setResultAmount(currentProfit)
            setShowResultModal(true)
            if (analysisIntervalRef.current) {
              clearInterval(analysisIntervalRef.current)
            }
            setIsRunning(false)
            setStatus("completed")
            addAnalysisLog("🎉 Take Profit hit! Session complete.", "success")
            console.log("[v0] SmartAuto24: Take profit reached")
            return false
          } else if (currentProfit <= -(Number.parseFloat(stake) * 10)) {
            setResultType("sl")
            setResultAmount(Math.abs(currentProfit))
            setShowResultModal(true)
            if (analysisIntervalRef.current) {
              clearInterval(analysisIntervalRef.current)
            }
            setIsRunning(false)
            setStatus("completed")
            addAnalysisLog("⚠️ Stop Loss hit! Session complete.", "warning")
            console.log("[v0] SmartAuto24: Stop loss reached")
            return false
          }
        }
        return true
      } catch (error) {
        console.error("[v0] SmartAuto24: AutoTrade execution error:", error)
        addAnalysisLog(`❌ Trade error: ${error}`, "warning")
        return true
      }
    }

    console.log("[v0] SmartAuto24: Executing first trade")
    const shouldContinue = await executeTrade()

    if (!shouldContinue) {
      return
    }

    const tradeInterval = Math.max((ticksPerTrade + 2) * 1000, 8000)
    addAnalysisLog(`⏱️ AutoTrade interval set to ${tradeInterval / 1000}s`, "info")
    console.log("[v0] SmartAuto24: Setting up trade interval:", tradeInterval)

    analysisIntervalRef.current = setInterval(async () => {
      const shouldContinue = await executeTrade()
      if (!shouldContinue && analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current)
      }
    }, tradeInterval)
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
                  theme === "dark" ? "bg-gray-900/50 border border-gray-700" : "bg-gray-900 border border-gray-800"
                }`}
              >
                <p className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-300"}`}>
                  {analysisData.description}
                </p>
              </div>
            </Card>
          )}

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

          {tradeHistory.length > 0 && <TransactionHistory transactions={tradeHistory} theme={theme} />}

          {journalLog.length > 0 && <TradingJournalPanel entries={journalLog} theme={theme} />}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className={`p-6 border rounded-lg ${
                sessionProfit >= 0
                  ? theme === "dark"
                    ? "bg-gradient-to-br from-green-500/10 to-green-500/10 border-green-500/30"
                    : "bg-green-50 border-green-200"
                  : theme === "dark"
                    ? "bg-gradient-to-br from-red-500/10 to-red-500/10 border-red-500/30"
                    : "bg-red-50 border-red-200"
              }`}
            >
              <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Session P&L</div>
              <div
                className={`text-3xl font-bold flex items-center gap-2 ${
                  sessionProfit >= 0
                    ? theme === "dark"
                      ? "text-green-400"
                      : "text-green-600"
                    : theme === "dark"
                      ? "text-red-400"
                      : "text-red-600"
                }`}
              >
                {sessionProfit >= 0 ? "+" : "-"}${Math.abs(sessionProfit).toFixed(2)}
              </div>
            </div>

            <div
              className={`p-6 border rounded-lg ${
                theme === "dark"
                  ? "bg-gradient-to-br from-blue-500/10 to-blue-500/10 border-blue-500/30"
                  : "bg-blue-50 border-blue-200"
              }`}
            >
              <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Trades Executed</div>
              <div className={`text-3xl font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                {sessionTrades}
              </div>
            </div>

            <div
              className={`p-6 border rounded-lg ${
                theme === "dark"
                  ? "bg-gradient-to-br from-yellow-500/10 to-yellow-500/10 border-yellow-500/30"
                  : "bg-yellow-50 border-yellow-200"
              }`}
            >
              <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Status</div>
              <div className={`text-lg font-bold ${theme === "dark" ? "text-yellow-400" : "text-yellow-600"}`}>
                {status.toUpperCase()}
              </div>
            </div>
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
