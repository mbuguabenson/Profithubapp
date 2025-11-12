"use client"

import { useState, useRef, useEffect } from "react"
import { useDerivAPI } from "@/lib/deriv-api-context"
import { useDerivAuth } from "@/hooks/use-deriv-auth"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Play, Pause } from "lucide-react"
import { DerivRealTrader } from "@/lib/deriv-real-trader"
import { EvenOddStrategy } from "@/lib/even-odd-strategy"
import { TradingJournal } from "@/lib/trading-journal"
import { TradeResultModal } from "@/components/modals/trade-result-modal"
import { TradingStrategies } from "@/lib/trading-strategies"
import { TradingStatsPanel } from "@/components/trading-stats-panel"
import { TransactionHistory } from "@/components/transaction-history"
import { TradingJournalPanel } from "@/components/trading-journal-panel"
import { CleanTradeEngine } from "@/lib/clean-trade-engine"
import { useGlobalTradingContext } from "@/hooks/use-global-trading-context" // Fixed import path to use hooks directory

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
  const { balance, isLoggedIn } = useDerivAuth()
  const globalContext = useGlobalTradingContext()

  const [tokenConnected, setTokenConnected] = useState(isLoggedIn)

  const [allMarkets, setAllMarkets] = useState<Array<{ symbol: string; display_name: string }>>([])
  const [loadingMarkets, setLoadingMarkets] = useState(true)

  // Configuration state
  const [market, setMarket] = useState("R_100")
  const [stake, setStake] = useState("0.35")
  const [targetProfit, setTargetProfit] = useState("1")
  const [analysisTimeMinutes, setAnalysisTimeMinutes] = useState("30")
  const [ticksForEntry, setTicksForEntry] = useState("36000")
  const [strategies] = useState<string[]>(["Even/Odd", "Over 3/Under 6", "Over 2/Under 7", "Differs Pro"])
  const [selectedStrategy, setSelectedStrategy] = useState("Even/Odd")
  const strategiesRef = useRef<TradingStrategies>(new TradingStrategies())

  const [martingaleRatios, setMartingaleRatios] = useState<Record<string, number>>({
    "Even/Odd": 2.0,
    "Over 3/Under 6": 2.6,
    "Over 2/Under 7": 3.5,
    "Differs Pro": 2.2,
  })

  const [ticksPerTrade, setTicksPerTrade] = useState<number>(5)

  const [autoRestartEnabled, setAutoRestartEnabled] = useState(true)
  const [restartDelaySeconds, setRestartDelaySeconds] = useState(2)

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

  const engineRef = useRef<CleanTradeEngine | null>(null)

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
          console.log("[v0] SmartAuto24: Loaded all markets:", symbols.length)
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
    if (globalContext.sharedWebSocket && isLoggedIn) {
      console.log("[v0] SmartAuto24: Using shared WebSocket from OAuth")
      // The shared WebSocket is already authorized and connected
      setTokenConnected(true)
    }
  }, [globalContext.sharedWebSocket, isLoggedIn])

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

  // Remove handleConnectToken function, as token management is no longer local
  // const handleConnectToken = async (tokenToUse?: string) => {
  //   const tokenValue = tokenToUse || apiTokenInput
  //   if (!tokenValue) {
  //     addAnalysisLog("API token cannot be empty.", "warning")
  //     return
  //   }
  //   try {
  //     await submitApiToken(tokenValue)
  //     setTokenConnected(true)
  //     addAnalysisLog("API token connected successfully.", "success")
  //     localStorage.setItem("deriv_api_token_smartauto24", tokenValue)
  //   } catch (error) {
  //     console.error("Failed to connect token:", error)
  //     addAnalysisLog(`Failed to connect token: ${error}`, "warning")
  //   }
  // }

  const handleStartAnalysis = async () => {
    // Check for isLoggedIn instead of isAuthorized and apiClient/isConnected
    if (!isLoggedIn) {
      addAnalysisLog("Please log in to start trading.", "warning")
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
    addAnalysisLog("Analysis complete! Starting trade execution...", "success")

    const isVolatilityIndex = market.startsWith("R_") || market.startsWith("1HZ")
    const requiresVolatilityIndex = ["Even/Odd", "Over 3/Under 6", "Over 2/Under 7", "Differs Pro"].includes(
      selectedStrategy,
    )

    if (requiresVolatilityIndex && !isVolatilityIndex) {
      addAnalysisLog(
        `❌ Error: ${selectedStrategy} strategy requires a volatility index (R_10, R_25, R_50, etc.). Current market: ${market}`,
        "warning",
      )
      setIsRunning(false)
      setStatus("idle")
      return
    }

    const recentDigits: number[] = []
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < digitFrequencies[i]; j++) {
        recentDigits.push(i)
      }
    }

    let analysis: any = null
    if (selectedStrategy === "Even/Odd") {
      analysis = strategiesRef.current!.analyzeEvenOdd(recentDigits)
    } else if (selectedStrategy === "Over 3/Under 6") {
      analysis = strategiesRef.current!.analyzeOver3Under6(recentDigits)
    } else if (selectedStrategy === "Over 2/Under 7") {
      analysis = strategiesRef.current!.analyzeOver2Under7(recentDigits)
    } else if (selectedStrategy === "Differs Pro") {
      analysis = analyzeDiffersPro(recentDigits)
    }

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
      setIsRunning(false)
      setStatus("idle")
      return
    }

    addAnalysisLog(`${selectedStrategy} Power: ${analysis.power.toFixed(1)}% - Signal: ${analysis.signal}`, "success")
    addAnalysisLog(`🤖 Starting automated trading...`, "info")

    if (!apiClient) {
      addAnalysisLog("❌ API client not available", "warning")
      setIsRunning(false)
      setStatus("idle")
      return
    }

    engineRef.current = new CleanTradeEngine(apiClient)

    if (selectedStrategy === "Differs Pro" && analysis.targetDigit !== null) {
      addAnalysisLog(`🎯 Starting Differs Pro monitoring for digit ${analysis.targetDigit}`, "info")
      await startDiffersProTrading(analysis.targetDigit)
      return
    }

    await startStandardTradingLoop(analysis)
  }

  const startStandardTradingLoop = async (analysis: any) => {
    let tradesExecuted = 0
    const martingaleMultiplier = martingaleRatios[selectedStrategy] || 2.0
    const baseStake = Number.parseFloat(stake)

    while (isRunning && engineRef.current) {
      try {
        const currentStake = tradesExecuted > 0 ? baseStake * Math.pow(martingaleMultiplier, tradesExecuted) : baseStake

        const contractType = analysis.signal === "BUY" ? "CALL" : analysis.signal === "SELL" ? "PUT" : analysis.signal

        addAnalysisLog(
          `⚡ Executing trade ${tradesExecuted + 1}: ${contractType} | Stake: $${currentStake.toFixed(2)}`,
          "info",
        )

        const result = await engineRef.current.execute({
          symbol: market,
          contractType,
          stake: currentStake,
          duration: ticksPerTrade,
          durationUnit: "t",
          currency: "USD",
          barrier: analysis.targetDigit !== undefined ? analysis.targetDigit.toString() : undefined,
        })

        const newSessionProfit = sessionProfit + result.profit
        setSessionProfit(newSessionProfit)
        setSessionTrades((prev) => prev + 1)

        setStats((prev) => {
          const newStats = { ...prev }
          newStats.numberOfRuns++
          newStats.totalStake += currentStake

          if (result.win) {
            newStats.totalWins++
            newStats.contractsWon++
            newStats.totalProfit += result.profit
            newStats.totalPayout += result.payout
            tradesExecuted = 0
            addAnalysisLog(
              `💰 WIN ✓ | Profit: +$${result.profit.toFixed(2)} | Total: +$${newSessionProfit.toFixed(2)}`,
              "success",
            )
          } else {
            newStats.totalLosses++
            newStats.contractsLost++
            newStats.totalProfit += result.profit
            newStats.totalPayout += result.payout
            tradesExecuted++
            addAnalysisLog(
              `💥 LOSS ✗ | Loss: -$${Math.abs(result.profit).toFixed(2)} | Total: ${newSessionProfit >= 0 ? "+" : ""}$${newSessionProfit.toFixed(2)}`,
              "warning",
            )
          }

          newStats.winRate = newStats.numberOfRuns > 0 ? (newStats.totalWins / newStats.numberOfRuns) * 100 : 0
          return newStats
        })

        setTradeHistory((prev) => [
          {
            id: result.contractId || `trade-${Date.now()}`,
            contractType: analysis.signal,
            market,
            entrySpot: result.entrySpot?.toString() || "N/A",
            exitSpot: result.exitSpot?.toString() || "N/A",
            buyPrice: currentStake,
            profitLoss: result.profit,
            timestamp: Date.now(),
            status: result.win ? "win" : "loss",
          },
          ...prev,
        ])

        if (newSessionProfit >= Number.parseFloat(targetProfit)) {
          setResultType("tp")
          setResultAmount(newSessionProfit)
          setShowResultModal(true)
          setIsRunning(false)
          setStatus("completed")
          addAnalysisLog("🎉 TARGET PROFIT reached! Session complete.", "success")
          break
        }

        if (newSessionProfit <= -(baseStake * 10)) {
          setResultType("sl")
          setResultAmount(Math.abs(newSessionProfit))
          setShowResultModal(true)
          setIsRunning(false)
          setStatus("completed")
          addAnalysisLog("⚠️ STOP LOSS hit! Session complete.", "warning")
          break
        }

        if (autoRestartEnabled && isRunning) {
          addAnalysisLog(`⏱️ Next trade in ${restartDelaySeconds}s...`, "info")
          await new Promise((resolve) => setTimeout(resolve, restartDelaySeconds * 1000))
        } else {
          break
        }
      } catch (error: any) {
        console.error("[v0] Trade execution error:", error)
        addAnalysisLog(`❌ Trade error: ${error.message}`, "warning")

        if (autoRestartEnabled && isRunning) {
          addAnalysisLog("⏱️ Retrying in 5s...", "warning")
          await new Promise((resolve) => setTimeout(resolve, 5000))
        } else {
          break
        }
      }
    }

    if (isRunning) {
      setIsRunning(false)
      setStatus("completed")
      addAnalysisLog("Trading session ended.", "info")
    }
  }

  const startDiffersProTrading = async (targetDigit: number) => {
    let digitAppeared = false
    let ticksAfterAppearance = 0
    let tradesExecuted = 0
    const martingaleMultiplier = martingaleRatios["Differs Pro"] || 2.2
    const baseStake = Number.parseFloat(stake)

    while (isRunning && engineRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 1000))

      if (!isRunning) break

      const currentDigit = lastDigit

      if (currentDigit === targetDigit) {
        if (!digitAppeared) {
          digitAppeared = true
          ticksAfterAppearance = 0
          addAnalysisLog(`🎯 Digit ${targetDigit} appeared! Monitoring next 3 ticks...`, "info")
        } else if (ticksAfterAppearance <= 3) {
          addAnalysisLog(`⚠️ Digit ${targetDigit} appeared again. Resetting...`, "warning")
          digitAppeared = false
          ticksAfterAppearance = 0
        }
        continue
      }

      if (digitAppeared) {
        ticksAfterAppearance++

        if (ticksAfterAppearance >= 3) {
          try {
            const currentStake =
              tradesExecuted > 0 ? baseStake * Math.pow(martingaleMultiplier, tradesExecuted) : baseStake

            addAnalysisLog(
              `⚡ Executing Differs trade: Digit ${targetDigit} | Stake: $${currentStake.toFixed(2)}`,
              "info",
            )

            const result = await engineRef.current.execute({
              symbol: market,
              contractType: "DIGITMATCH",
              stake: currentStake,
              duration: ticksPerTrade,
              durationUnit: "t",
              currency: "USD",
              barrier: targetDigit.toString(),
            })

            const newSessionProfit = sessionProfit + result.profit
            setSessionProfit(newSessionProfit)
            setSessionTrades((prev) => prev + 1)

            setStats((prev) => {
              const newStats = { ...prev }
              newStats.numberOfRuns++
              newStats.totalStake += currentStake

              if (result.win) {
                newStats.totalWins++
                newStats.contractsWon++
                newStats.totalProfit += result.profit
                newStats.totalPayout += result.payout
                tradesExecuted = 0
                addAnalysisLog(
                  `💰 WIN ✓ | Profit: +$${result.profit.toFixed(2)} | Total: +$${newSessionProfit.toFixed(2)}`,
                  "success",
                )
              } else {
                newStats.totalLosses++
                newStats.contractsLost++
                newStats.totalProfit += result.profit
                newStats.totalPayout += result.payout
                tradesExecuted++
                addAnalysisLog(
                  `💥 LOSS ✗ | Loss: -$${Math.abs(result.profit).toFixed(2)} | Total: ${newSessionProfit >= 0 ? "+" : ""}$${newSessionProfit.toFixed(2)}`,
                  "warning",
                )
              }

              newStats.winRate = newStats.numberOfRuns > 0 ? (newStats.totalWins / newStats.numberOfRuns) * 100 : 0
              return newStats
            })

            setTradeHistory((prev) => [
              {
                id: result.contractId || `trade-${Date.now()}`,
                contractType: `DIFFERS ${targetDigit}`,
                market,
                entrySpot: result.entrySpot?.toString() || "N/A",
                exitSpot: result.exitSpot?.toString() || "N/A",
                buyPrice: currentStake,
                profitLoss: result.profit,
                timestamp: Date.now(),
                status: result.win ? "win" : "loss",
              },
              ...prev,
            ])

            if (newSessionProfit >= Number.parseFloat(targetProfit)) {
              setResultType("tp")
              setResultAmount(newSessionProfit)
              setShowResultModal(true)
              setIsRunning(false)
              setStatus("completed")
              addAnalysisLog("🎉 TARGET PROFIT reached!", "success")
              break
            }

            if (newSessionProfit <= -(baseStake * 10)) {
              setResultType("sl")
              setResultAmount(Math.abs(newSessionProfit))
              setShowResultModal(true)
              setIsRunning(false)
              setStatus("completed")
              addAnalysisLog("⚠️ STOP LOSS hit!", "warning")
              break
            }

            digitAppeared = false
            ticksAfterAppearance = 0

            if (autoRestartEnabled && isRunning) {
              addAnalysisLog(`⏱️ Monitoring for digit ${targetDigit} again...`, "info")
              await new Promise((resolve) => setTimeout(resolve, restartDelaySeconds * 1000))
            } else {
              break
            }
          } catch (error: any) {
            console.error("[v0] Differs Pro trade error:", error)
            addAnalysisLog(`❌ Trade error: ${error.message}`, "warning")
            digitAppeared = false
            ticksAfterAppearance = 0

            if (autoRestartEnabled) {
              await new Promise((resolve) => setTimeout(resolve, 5000))
            } else {
              break
            }
          }
        }
      }
    }

    if (isRunning) {
      setIsRunning(false)
      setStatus("completed")
      addAnalysisLog("Differs Pro trading ended.", "info")
    }
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
      {!isLoggedIn ? (
        <Card
          className={`p-6 border ${
            theme === "dark"
              ? "bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 border-yellow-500/30"
              : "bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200"
          }`}
        >
          <div className="text-center py-8">
            <h3 className={`text-xl font-bold mb-2 ${theme === "dark" ? "text-yellow-400" : "text-yellow-700"}`}>
              Please Login with Deriv OAuth
            </h3>
            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
              Click the "Login with Deriv" button in the header to get started
            </p>
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

              <div className="col-span-2">
                <div
                  className={`p-4 rounded-lg border flex items-center justify-between ${
                    theme === "dark" ? "bg-blue-500/10 border-blue-500/30" : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <div>
                    <label
                      className={`block text-sm font-medium ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                    >
                      Auto-Restart After Trade
                    </label>
                    <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                      Automatically place next trade after current trade closes
                    </p>
                  </div>
                  <Button
                    onClick={() => setAutoRestartEnabled(!autoRestartEnabled)}
                    variant={autoRestartEnabled ? "default" : "outline"}
                    className={
                      autoRestartEnabled
                        ? "bg-green-500 hover:bg-green-600 text-white"
                        : theme === "dark"
                          ? "border-gray-600 text-gray-400"
                          : "border-gray-300 text-gray-600"
                    }
                  >
                    {autoRestartEnabled ? "ENABLED" : "DISABLED"}
                  </Button>
                </div>
              </div>

              {autoRestartEnabled && (
                <div>
                  <label
                    className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Restart Delay (seconds)
                  </label>
                  <Input
                    type="number"
                    value={restartDelaySeconds}
                    onChange={(e) => setRestartDelaySeconds(Number.parseInt(e.target.value) || 2)}
                    className={`${
                      theme === "dark"
                        ? "bg-[#0a0e27]/50 border-yellow-500/30 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                    min="1"
                    max="10"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleStartAnalysis}
                // Removed tokenConnected check, rely on isLoggedIn
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
