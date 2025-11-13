"use client"

import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Activity, Zap, Target } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
  const [tradeSignal, setTradeSignal] = useState<TradeSignal | null>(null)
  const [showSignalPopup, setShowSignalPopup] = useState(false)
  const wsConnectionsRef = useRef<Map<string, WebSocket>>(new Map())

  useEffect(() => {
    const initialData = new Map<string, MarketData>()

    MARKETS.forEach((market) => {
      // Initialize market data
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

      // Create WebSocket connection for each market
      const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089")

      ws.onopen = () => {
        ws.send(JSON.stringify({ ticks: market.symbol, subscribe: 1 }))
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.tick) {
          updateMarketData(market.symbol, data.tick.quote)
        }
      }

      wsConnectionsRef.current.set(market.symbol, ws)
    })

    setMarketsData(initialData)

    // Cleanup WebSocket connections on unmount
    return () => {
      wsConnectionsRef.current.forEach((ws) => ws.close())
      wsConnectionsRef.current.clear()
    }
  }, [])

  const updateMarketData = (symbol: string, price: number) => {
    setMarketsData((prev) => {
      const updated = new Map(prev)
      const marketData = updated.get(symbol)

      if (!marketData) return prev

      const lastDigit = Math.floor((price * 100) % 10)
      const newDigits = [...marketData.last100Digits, lastDigit].slice(-100)

      // Analyze only if we have 100 digits
      let analysis = marketData.analysis
      if (newDigits.length === 100) {
        const underCount = newDigits.filter((d) => d < 5).length
        const overCount = newDigits.filter((d) => d >= 5).length
        const evenCount = newDigits.filter((d) => d % 2 === 0).length
        const oddCount = newDigits.filter((d) => d % 2 === 1).length

        // Find least frequent digit for differs
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

        // Check if any signal should trigger popup
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
        conditions: [
          `Digit ${analysis.differs.digit} rarely appears: ${analysis.differs.count}/100`,
          `High probability of difference`,
          `Entry confidence: HIGH`,
        ],
      })
    }

    // Show popup for the first strong signal
    if (signals.length > 0 && !showSignalPopup) {
      setTradeSignal(signals[0])
      setShowSignalPopup(true)
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
          <Badge className="bg-emerald-500 text-white text-sm px-4 py-2 animate-pulse flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Live Monitoring {MARKETS.length} Markets
          </Badge>
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
                <div>
                  <h3 className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {market.displayName}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
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
                  <Badge
                    className={`${theme === "dark" ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700"}`}
                  >
                    100 Ticks
                  </Badge>
                )}
              </div>

              {market.last100Digits.length === 100 && (
                <div className="space-y-2">
                  {/* Under/Over Analysis */}
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className={`p-2 rounded border ${
                        market.analysis.under.signal === "TRADE NOW"
                          ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                          : theme === "dark"
                            ? "bg-gray-800/50 border-gray-700"
                            : "bg-gray-100 border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Under (0-4)
                        </span>
                        <Badge
                          className={`text-xs ${
                            market.analysis.under.signal === "TRADE NOW"
                              ? "bg-emerald-500 text-white animate-pulse"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {market.analysis.under.signal}
                        </Badge>
                      </div>
                      <div className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                        {market.analysis.under.percentage}%
                      </div>
                    </div>

                    <div
                      className={`p-2 rounded border ${
                        market.analysis.over.signal === "TRADE NOW"
                          ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                          : theme === "dark"
                            ? "bg-gray-800/50 border-gray-700"
                            : "bg-gray-100 border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Over (5-9)
                        </span>
                        <Badge
                          className={`text-xs ${
                            market.analysis.over.signal === "TRADE NOW"
                              ? "bg-emerald-500 text-white animate-pulse"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {market.analysis.over.signal}
                        </Badge>
                      </div>
                      <div className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                        {market.analysis.over.percentage}%
                      </div>
                    </div>
                  </div>

                  {/* Even/Odd Analysis */}
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className={`p-2 rounded border ${
                        market.analysis.even.signal === "TRADE NOW"
                          ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                          : theme === "dark"
                            ? "bg-gray-800/50 border-gray-700"
                            : "bg-gray-100 border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Even</span>
                        <Badge
                          className={`text-xs ${
                            market.analysis.even.signal === "TRADE NOW"
                              ? "bg-emerald-500 text-white animate-pulse"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {market.analysis.even.signal}
                        </Badge>
                      </div>
                      <div className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                        {market.analysis.even.percentage}%
                      </div>
                    </div>

                    <div
                      className={`p-2 rounded border ${
                        market.analysis.odd.signal === "TRADE NOW"
                          ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                          : theme === "dark"
                            ? "bg-gray-800/50 border-gray-700"
                            : "bg-gray-100 border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Odd</span>
                        <Badge
                          className={`text-xs ${
                            market.analysis.odd.signal === "TRADE NOW"
                              ? "bg-emerald-500 text-white animate-pulse"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {market.analysis.odd.signal}
                        </Badge>
                      </div>
                      <div className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                        {market.analysis.odd.percentage}%
                      </div>
                    </div>
                  </div>

                  {/* Differs Analysis */}
                  <div
                    className={`p-2 rounded border ${
                      market.analysis.differs.signal === "TRADE NOW"
                        ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                        : theme === "dark"
                          ? "bg-gray-800/50 border-gray-700"
                          : "bg-gray-100 border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                        Differs ({market.analysis.differs.digit})
                      </span>
                      <Badge
                        className={`text-xs ${
                          market.analysis.differs.signal === "TRADE NOW"
                            ? "bg-emerald-500 text-white animate-pulse"
                            : "bg-blue-500/20 text-blue-400"
                        }`}
                      >
                        {market.analysis.differs.signal}
                      </Badge>
                    </div>
                    <div className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {market.analysis.differs.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <Dialog open={showSignalPopup} onOpenChange={setShowSignalPopup}>
        <DialogContent
          className={`max-w-md ${
            theme === "dark"
              ? "bg-gradient-to-br from-emerald-900/90 to-green-900/90 border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.6)]"
              : "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-300"
          } animate-pulse`}
        >
          <DialogHeader>
            <DialogTitle
              className={`text-2xl font-bold flex items-center gap-2 ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}
            >
              <Zap className="h-6 w-6" />
              TRADE NOW!
            </DialogTitle>
          </DialogHeader>
          {tradeSignal && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-lg border ${theme === "dark" ? "bg-gray-900/50 border-emerald-500/30" : "bg-white border-emerald-300"}`}
              >
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Market:</span>
                    <div className={`font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {tradeSignal.market}
                    </div>
                  </div>
                  <div>
                    <span className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Trade Type:</span>
                    <div className={`font-bold ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}>
                      {tradeSignal.tradeType}
                    </div>
                  </div>
                  <div>
                    <span className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Entry Point:</span>
                    <div className={`font-bold ${theme === "dark" ? "text-cyan-400" : "text-cyan-600"}`}>
                      {tradeSignal.entryPoint}
                    </div>
                  </div>
                  <div>
                    <span className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Validity:</span>
                    <div className={`font-bold ${theme === "dark" ? "text-orange-400" : "text-orange-600"}`}>
                      {tradeSignal.validity}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`p-4 rounded-lg border ${theme === "dark" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-emerald-100 border-emerald-300"}`}
              >
                <div className={`text-sm font-bold mb-2 ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}>
                  Trade Conditions:
                </div>
                <ul className="space-y-1">
                  {tradeSignal.conditions.map((condition, idx) => (
                    <li key={idx} className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                      • {condition}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Confidence:</span>
                  <div className={`text-2xl font-bold ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}>
                    {tradeSignal.confidence}%
                  </div>
                </div>
                <Button
                  onClick={() => setShowSignalPopup(false)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Got It!
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
