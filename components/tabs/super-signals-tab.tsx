"use client"

import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Activity, Zap, X, Eye, EyeOff } from "lucide-react"
import { TickHistoryManager } from "@/lib/tick-history-manager"
import { DerivAPIClient } from "@/lib/deriv-api"

interface MarketData {
  symbol: string
  displayName: string
  currentPrice: number
  lastDigit: number
  last100Digits: number[]
  analysis: {
    under: { count: number; percentage: number; signal: "WAIT" | "TRADE NOW" }
    over: { count: number; percentage: number; signal: "WAIT" | "TRADE NOW" }
    even: { count: number; percentage: number; signal: "WAIT" | "TRADE NOW" }
    odd: { count: number; percentage: number; signal: "WAIT" | "TRADE NOW" }
    differs: { digit: number; count: number; percentage: number; signal: "WAIT" | "TRADE NOW" }
  }
}

interface TradeSignal {
  market: string
  tradeType: string
  entryPoint: string
  validity: string
  confidence: number
  conditions: string[]
  category: "even-odd" | "over-under" | "differs"
}

const MARKETS = [
  { symbol: "R_10", name: "Volatility 10 (1s)" },
  { symbol: "R_25", name: "Volatility 25" },
  { symbol: "R_50", name: "Volatility 50" },
  { symbol: "R_75", name: "Volatility 75" },
  { symbol: "R_100", name: "Volatility 100" },
  { symbol: "1HZ10V", name: "Volatility 10 (1s) Index" },
  { symbol: "1HZ25V", name: "Volatility 25 (1s) Index" },
  { symbol: "1HZ50V", name: "Volatility 50 (1s) Index" },
  { symbol: "1HZ75V", name: "Volatility 75 (1s) Index" },
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index" },
]

interface SuperSignalsTabProps {
  theme?: "light" | "dark"
}

export function SuperSignalsTab({ theme = "dark" }: SuperSignalsTabProps) {
  const [marketsData, setMarketsData] = useState<Map<string, MarketData>>(new Map())
  const [tradeSignals, setTradeSignals] = useState<TradeSignal[]>([])
  const [showSignalPopup, setShowSignalPopup] = useState(false)
  const [autoShowSignals, setAutoShowSignals] = useState(true)
  const tickManagerRef = useRef<TickHistoryManager | null>(null)
  const apiClientRef = useRef<any>(null)
  const isInitializedRef = useRef(false)

  useEffect(() => {
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    const initMarkets = async () => {
      const initialData = new Map<string, MarketData>()

      MARKETS.forEach((market) => {
        initialData.set(market.symbol, {
          symbol: market.symbol,
          displayName: market.name,
          currentPrice: 0,
          lastDigit: 0,
          last100Digits: [],
          analysis: {
            under: { count: 0, percentage: 0, signal: "WAIT" },
            over: { count: 0, percentage: 0, signal: "WAIT" },
            even: { count: 0, percentage: 0, signal: "WAIT" },
            odd: { count: 0, percentage: 0, signal: "WAIT" },
            differs: { digit: 0, count: 0, percentage: 0, signal: "WAIT" },
          },
        })
      })

      setMarketsData(initialData)

      const apiClient = new DerivAPIClient({ appId: "1089" })
      apiClientRef.current = apiClient
      await apiClient.connect()

      tickManagerRef.current = new TickHistoryManager(apiClient)

      const symbols = MARKETS.map((m) => m.symbol)
      await tickManagerRef.current.loadTickHistorySequentially(symbols, 100)

      await tickManagerRef.current.subscribeToMarkets(symbols)
    }

    initMarkets()

    const updateInterval = setInterval(() => {
      if (!tickManagerRef.current) return

      setMarketsData((prev) => {
        const updated = new Map(prev)

        MARKETS.forEach((market) => {
          const digits = tickManagerRef.current!.getTickBuffer(market.symbol)
          const marketData = updated.get(market.symbol)

          if (!marketData || digits.length < 100) return

          const lastDigit = digits[digits.length - 1]
          const currentPrice = Math.random() * 1000

          const underCount = digits.filter((d) => d < 5).length
          const overCount = digits.filter((d) => d >= 5).length
          const evenCount = digits.filter((d) => d % 2 === 0).length
          const oddCount = digits.filter((d) => d % 2 === 1).length

          const digitCounts = Array(10).fill(0)
          digits.forEach((d) => digitCounts[d]++)
          const minCount = Math.min(...digitCounts)
          const leastFrequentDigit = digitCounts.indexOf(minCount)

          const analysis = {
            under: {
              count: underCount,
              percentage: underCount,
              signal: (underCount >= 60 ? "TRADE NOW" : "WAIT") as "WAIT" | "TRADE NOW",
            },
            over: {
              count: overCount,
              percentage: overCount,
              signal: (overCount >= 60 ? "TRADE NOW" : "WAIT") as "WAIT" | "TRADE NOW",
            },
            even: {
              count: evenCount,
              percentage: evenCount,
              signal: (evenCount >= 60 ? "TRADE NOW" : "WAIT") as "WAIT" | "TRADE NOW",
            },
            odd: {
              count: oddCount,
              percentage: oddCount,
              signal: (oddCount >= 60 ? "TRADE NOW" : "WAIT") as "WAIT" | "TRADE NOW",
            },
            differs: {
              digit: leastFrequentDigit,
              count: minCount,
              percentage: 100 - (minCount / digits.length) * 100,
              signal: (minCount <= 5 ? "TRADE NOW" : "WAIT") as "WAIT" | "TRADE NOW",
            },
          }

          checkForTradeSignal(market.symbol, marketData.displayName, analysis, currentPrice)

          updated.set(market.symbol, {
            ...marketData,
            currentPrice,
            lastDigit,
            last100Digits: digits,
            analysis,
          })
        })

        return updated
      })
    }, 1000)

    return () => {
      clearInterval(updateInterval)
    }
  }, [])

  const updateMarketData = (symbol: string, price: number) => {
    setMarketsData((prev) => {
      const updated = new Map(prev)
      const marketData = updated.get(symbol)

      if (!marketData) return prev

      const lastDigit = Math.floor((price * 100) % 10)
      const newDigits = [...marketData.last100Digits, lastDigit].slice(-100)

      let analysis = marketData.analysis
      if (newDigits.length === 100) {
        const underCount = newDigits.filter((d) => d < 5).length
        const overCount = newDigits.filter((d) => d >= 5).length
        const evenCount = newDigits.filter((d) => d % 2 === 0).length
        const oddCount = newDigits.filter((d) => d % 2 === 1).length

        const digitCounts = Array(10).fill(0)
        newDigits.forEach((d) => digitCounts[d]++)
        const minCount = Math.min(...digitCounts)
        const leastFrequentDigit = digitCounts.indexOf(minCount)

        analysis = {
          under: {
            count: underCount,
            percentage: underCount,
            signal: underCount >= 60 ? "TRADE NOW" : "WAIT",
          },
          over: {
            count: overCount,
            percentage: overCount,
            signal: overCount >= 60 ? "TRADE NOW" : "WAIT",
          },
          even: {
            count: evenCount,
            percentage: evenCount,
            signal: evenCount >= 60 ? "TRADE NOW" : "WAIT",
          },
          odd: {
            count: oddCount,
            percentage: oddCount,
            signal: oddCount >= 60 ? "TRADE NOW" : "WAIT",
          },
          differs: {
            digit: leastFrequentDigit,
            count: minCount,
            percentage: 100 - (minCount / newDigits.length) * 100,
            signal: minCount <= 5 ? "TRADE NOW" : "WAIT",
          },
        }

        checkForTradeSignal(symbol, marketData.displayName, analysis, price)
      }

      updated.set(symbol, {
        ...marketData,
        currentPrice: price,
        lastDigit,
        last100Digits: newDigits,
        analysis,
      })

      return updated
    })
  }

  const checkForTradeSignal = (
    symbol: string,
    displayName: string,
    analysis: MarketData["analysis"],
    price: number,
  ) => {
    const signals: TradeSignal[] = []

    if (analysis.under.signal === "TRADE NOW") {
      signals.push({
        market: displayName,
        tradeType: "Under (0-4)",
        entryPoint: price.toFixed(5),
        validity: "5 ticks",
        confidence: analysis.under.percentage,
        category: "over-under",
        conditions: [
          `Under digits: ${analysis.under.count}/100 (${analysis.under.percentage}%)`,
          `Strong dominance detected`,
          `Entry confidence: HIGH`,
        ],
      })
    }

    if (analysis.over.signal === "TRADE NOW") {
      signals.push({
        market: displayName,
        tradeType: "Over (5-9)",
        entryPoint: price.toFixed(5),
        validity: "5 ticks",
        confidence: analysis.over.percentage,
        category: "over-under",
        conditions: [
          `Over digits: ${analysis.over.count}/100 (${analysis.over.percentage}%)`,
          `Strong dominance detected`,
          `Entry confidence: HIGH`,
        ],
      })
    }

    if (analysis.even.signal === "TRADE NOW") {
      signals.push({
        market: displayName,
        tradeType: "Even",
        entryPoint: price.toFixed(5),
        validity: "5 ticks",
        confidence: analysis.even.percentage,
        category: "even-odd",
        conditions: [
          `Even digits: ${analysis.even.count}/100 (${analysis.even.percentage}%)`,
          `Strong pattern detected`,
          `Entry confidence: HIGH`,
        ],
      })
    }

    if (analysis.odd.signal === "TRADE NOW") {
      signals.push({
        market: displayName,
        tradeType: "Odd",
        entryPoint: price.toFixed(5),
        validity: "5 ticks",
        confidence: analysis.odd.percentage,
        category: "even-odd",
        conditions: [
          `Odd digits: ${analysis.odd.count}/100 (${analysis.odd.percentage}%)`,
          `Strong pattern detected`,
          `Entry confidence: HIGH`,
        ],
      })
    }

    if (analysis.differs.signal === "TRADE NOW") {
      signals.push({
        market: displayName,
        tradeType: `Differs (${analysis.differs.digit})`,
        entryPoint: price.toFixed(5),
        validity: "5 ticks",
        confidence: analysis.differs.percentage,
        category: "differs",
        conditions: [
          `Digit ${analysis.differs.digit} rarely appears: ${analysis.differs.count}/100`,
          `High probability of difference`,
          `Entry confidence: HIGH`,
        ],
      })
    }

    if (signals.length > 0) {
      setTradeSignals((prev) => {
        const uniqueSignals = [...prev]
        signals.forEach((signal) => {
          const exists = uniqueSignals.some((s) => s.market === signal.market && s.tradeType === signal.tradeType)
          if (!exists) {
            uniqueSignals.push(signal)
          }
        })
        return uniqueSignals
      })
      if (autoShowSignals) {
        setShowSignalPopup(true)
      }
    }
  }

  const handleCloseAllSignals = () => {
    setShowSignalPopup(false)
  }

  const handleDismissPopup = () => {
    setShowSignalPopup(false)
  }

  const handleShowActiveSignals = () => {
    if (tradeSignals.length > 0) {
      setShowSignalPopup(true)
    }
  }

  const handleCloseSignal = (idx: number) => {
    setTradeSignals((prev) => prev.filter((_, i) => i !== idx))
    if (tradeSignals.length <= 1) {
      setShowSignalPopup(false)
    }
  }

  const totalMarkets = Array.from(marketsData.values())
  const marketsWithSignals = totalMarkets.filter(
    (m) =>
      m.analysis.under.signal === "TRADE NOW" ||
      m.analysis.over.signal === "TRADE NOW" ||
      m.analysis.even.signal === "TRADE NOW" ||
      m.analysis.odd.signal === "TRADE NOW" ||
      m.analysis.differs.signal === "TRADE NOW",
  )

  return (
    <div className="space-y-6">
      <div
        className={`rounded-xl p-6 border ${
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.2)]"
            : "bg-white/80 backdrop-blur-xl border-blue-200 shadow-[0_8px_32px_rgba(31,38,135,0.15)]"
        }`}
      >
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h2
            className={`text-2xl md:text-3xl font-bold ${theme === "dark" ? "bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent" : "bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent"}`}
          >
            Super Signals - Multi-Market Analysis
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={autoShowSignals}
                onCheckedChange={setAutoShowSignals}
                className="data-[state=checked]:bg-green-500"
              />
              <Label className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Auto-show signals
              </Label>
            </div>
            {tradeSignals.length > 0 && (
              <Button
                onClick={handleShowActiveSignals}
                className="bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-2"
              >
                <Eye className="h-4 w-4" />
                View Signals ({tradeSignals.length})
              </Button>
            )}
            <Badge className="bg-emerald-500 text-white text-sm px-4 py-2 animate-pulse flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Live Monitoring {MARKETS.length} Markets
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div
            className={`rounded-lg p-4 border ${theme === "dark" ? "bg-blue-500/10 border-blue-500/30" : "bg-blue-50 border-blue-200"}`}
          >
            <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Total Markets</div>
            <div className={`text-2xl font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
              {MARKETS.length}
            </div>
          </div>
          <div
            className={`rounded-lg p-4 border ${theme === "dark" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-emerald-50 border-emerald-200"}`}
          >
            <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Active Signals</div>
            <div className={`text-2xl font-bold ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}>
              {marketsWithSignals.length}
            </div>
          </div>
          <div
            className={`rounded-lg p-4 border ${theme === "dark" ? "bg-purple-500/10 border-purple-500/30" : "bg-purple-50 border-purple-200"}`}
          >
            <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Analyzed Ticks</div>
            <div className={`text-2xl font-bold ${theme === "dark" ? "text-purple-400" : "text-purple-600"}`}>100</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {totalMarkets.map((market) => {
          const hasSignal =
            market.analysis.under.signal === "TRADE NOW" ||
            market.analysis.over.signal === "TRADE NOW" ||
            market.analysis.even.signal === "TRADE NOW" ||
            market.analysis.odd.signal === "TRADE NOW" ||
            market.analysis.differs.signal === "TRADE NOW"

          return (
            <Card
              key={market.symbol}
              className={`p-4 border-2 ${
                hasSignal
                  ? theme === "dark"
                    ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse"
                    : "border-emerald-400 bg-gradient-to-br from-emerald-50 to-green-50 shadow-[0_8px_24px_rgba(16,185,129,0.2)]"
                  : theme === "dark"
                    ? "border-blue-500/30 bg-blue-500/5"
                    : "border-blue-200 bg-blue-50"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {market.displayName}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Price:</span>
                      <span className={`text-sm font-bold ${theme === "dark" ? "text-cyan-400" : "text-cyan-600"}`}>
                        {market.currentPrice.toFixed(5)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                        Last Digit:
                      </span>
                      <span className={`text-lg font-bold ${theme === "dark" ? "text-orange-400" : "text-orange-600"}`}>
                        {market.lastDigit}
                      </span>
                    </div>
                  </div>

                  {market.last100Digits.length === 100 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          theme === "dark" ? "border-green-500/50 text-green-400" : "border-green-500 text-green-600"
                        }`}
                      >
                        E:{market.analysis.even.percentage}% O:{market.analysis.odd.percentage}%
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          theme === "dark" ? "border-blue-500/50 text-blue-400" : "border-blue-500 text-blue-600"
                        }`}
                      >
                        U:{market.analysis.under.percentage}% O:{market.analysis.over.percentage}%
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          theme === "dark"
                            ? "border-purple-500/50 text-purple-400"
                            : "border-purple-500 text-purple-600"
                        }`}
                      >
                        D:{market.analysis.differs.digit}
                      </Badge>
                    </div>
                  )}
                </div>
                {market.last100Digits.length === 100 && (
                  <Badge
                    className={`${theme === "dark" ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700"}`}
                  >
                    100 Ticks
                  </Badge>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {showSignalPopup && tradeSignals.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="max-w-6xl w-full max-h-[85vh] overflow-hidden flex flex-col bg-gray-900/95 rounded-2xl">
            <div className="flex justify-between items-center p-4 border-b border-white/10 flex-shrink-0">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                Active Trade Signals ({tradeSignals.length})
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDismissPopup}
                  variant="outline"
                  size="sm"
                  className="bg-gray-700/50 hover:bg-gray-700 border-gray-600 text-white"
                >
                  <EyeOff className="h-4 w-4 mr-2" />
                  Dismiss
                </Button>
                <Button
                  onClick={handleCloseAllSignals}
                  variant="outline"
                  size="sm"
                  className="bg-red-500/20 hover:bg-red-500/30 border-red-500/50 text-white"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto p-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tradeSignals.map((signal, idx) => {
                  const bgColors = {
                    "even-odd":
                      theme === "dark"
                        ? "from-green-900/90 to-emerald-900/90 border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.5)]"
                        : "from-green-50 to-emerald-50 border-green-400",
                    "over-under":
                      theme === "dark"
                        ? "from-blue-900/90 to-cyan-900/90 border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.5)]"
                        : "from-blue-50 to-cyan-50 border-blue-400",
                    differs:
                      theme === "dark"
                        ? "from-purple-900/90 to-violet-900/90 border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.5)]"
                        : "from-purple-50 to-violet-50 border-purple-400",
                  }

                  const textColors = {
                    "even-odd": theme === "dark" ? "text-green-400" : "text-green-600",
                    "over-under": theme === "dark" ? "text-blue-400" : "text-blue-600",
                    differs: theme === "dark" ? "text-purple-400" : "text-purple-600",
                  }

                  return (
                    <div
                      key={idx}
                      className={`bg-gradient-to-br ${bgColors[signal.category]} border-2 rounded-xl p-4 relative`}
                    >
                      <Button
                        onClick={() => handleCloseSignal(idx)}
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 hover:bg-white/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>

                      <div className={`text-xl font-bold flex items-center gap-2 mb-3 ${textColors[signal.category]}`}>
                        <Zap className="h-5 w-5" />
                        TRADE NOW!
                      </div>

                      <div
                        className={`p-3 rounded-lg border mb-3 ${theme === "dark" ? "bg-gray-900/50 border-white/10" : "bg-white border-gray-200"}`}
                      >
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Market:</span>
                            <div className={`font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                              {signal.market}
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Type:</span>
                            <div className={`font-bold ${textColors[signal.category]}`}>{signal.tradeType}</div>
                          </div>
                          <div className="flex justify-between">
                            <span className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Entry:</span>
                            <div className={`font-bold ${theme === "dark" ? "text-cyan-400" : "text-cyan-600"}`}>
                              {signal.entryPoint}
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Validity:</span>
                            <div className={`font-bold ${theme === "dark" ? "text-orange-400" : "text-orange-600"}`}>
                              {signal.validity}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`p-3 rounded-lg border mb-3 ${theme === "dark" ? `${signal.category === "even-odd" ? "bg-green-500/10 border-green-500/30" : signal.category === "over-under" ? "bg-blue-500/10 border-blue-500/30" : "bg-purple-500/10 border-purple-500/30"}` : `${signal.category === "even-odd" ? "bg-green-100 border-green-300" : signal.category === "over-under" ? "bg-blue-100 border-blue-300" : "bg-purple-100 border-purple-300"}`}`}
                      >
                        <div className={`text-xs font-bold mb-2 ${textColors[signal.category]}`}>Conditions:</div>
                        <ul className="space-y-1">
                          {signal.conditions.map((condition, condIdx) => (
                            <li
                              key={condIdx}
                              className={`text-xs ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                            >
                              • {condition}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="text-center">
                        <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Confidence:
                        </span>
                        <div className={`text-xl font-bold ${textColors[signal.category]}`}>{signal.confidence}%</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
