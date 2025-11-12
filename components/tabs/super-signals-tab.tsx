"use client"

import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Activity, Zap, ScrollText, TrendingUp } from "lucide-react"
import { useDeriv } from "@/hooks/use-deriv"

interface VolatilitySignal {
  id: string
  volatility: string
  tradeType: string
  confidence: number
  signal: "TRADE NOW" | "WAIT" | "STRONG"
  marketPower: number
  patternStrength: number
  timestamp: number
  lastDigits: number[]
  percentages: {
    high: number
    low: number
    even: number
    odd: number
  }
}

interface VolatilityAnalysis {
  volatility: string
  signals: VolatilitySignal[]
  lastUpdate: number
  status: "analyzing" | "ready"
}

const VOLATILITIES = ["R_10", "R_25", "R_50", "R_75", "R_100"]
const VOLATILITY_LABELS: Record<string, string> = {
  R_10: "Volatility 10 (1s)",
  R_25: "Volatility 25 (25s)",
  R_50: "Volatility 50 (50s)",
  R_75: "Volatility 75 (75s)",
  R_100: "Volatility 100 (100s)",
}

interface SuperSignalsTabProps {
  theme?: "light" | "dark"
}

export function SuperSignalsTab({ theme = "dark" }: SuperSignalsTabProps) {
  const [volatilityAnalyses, setVolatilityAnalyses] = useState<Map<string, VolatilityAnalysis>>(new Map())
  const [showLogs, setShowLogs] = useState(false)
  const [scanLogs, setScanLogs] = useState<string[]>([])
  const ticksDataRef = useRef<Map<string, number[]>>(new Map())
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const { symbol } = useDeriv()

  useEffect(() => {
    const initialAnalyses = new Map<string, VolatilityAnalysis>()
    VOLATILITIES.forEach((vol) => {
      initialAnalyses.set(vol, {
        volatility: vol,
        signals: [],
        lastUpdate: 0,
        status: "analyzing",
      })
      ticksDataRef.current.set(vol, [])
    })
    setVolatilityAnalyses(initialAnalyses)

    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current)
    }

    analysisIntervalRef.current = setInterval(() => {
      const timestamp = new Date().toLocaleTimeString()
      const updatedAnalyses = new Map(volatilityAnalyses)

      VOLATILITIES.forEach((volatility) => {
        const volTicks = ticksDataRef.current.get(volatility) || []
        if (volTicks.length >= 10) {
          const signals = generateSignalsForVolatility(volatility, volTicks)
          updatedAnalyses.set(volatility, {
            volatility,
            signals: signals.sort((a, b) => b.confidence - a.confidence).slice(0, 5),
            lastUpdate: Date.now(),
            status: "ready",
          })
        }
      })

      setVolatilityAnalyses(updatedAnalyses)

      const allSignals = Array.from(updatedAnalyses.values()).flatMap((v) => v.signals)
      const logMessage = `[${timestamp}] Analyzed ${VOLATILITIES.length} volatilities - Found ${allSignals.length} signals`
      setScanLogs((prev) => [...prev.slice(-19), logMessage])
    }, 3000)

    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current)
      }
    }
  }, [])

  const generateSignalsForVolatility = (volatility: string, digits: number[]): VolatilitySignal[] => {
    const signals: VolatilitySignal[] = []

    if (digits.length < 10) return signals

    const last20 = digits.slice(-20)
    const highCount = last20.filter((d) => d >= 5).length
    const lowCount = last20.filter((d) => d < 5).length
    const evenCount = last20.filter((d) => d % 2 === 0).length
    const oddCount = last20.filter((d) => d % 2 === 1).length

    const highPct = (highCount / last20.length) * 100
    const lowPct = (lowCount / last20.length) * 100
    const evenPct = (evenCount / last20.length) * 100
    const oddPct = (oddCount / last20.length) * 100

    if (highPct >= 60) {
      signals.push({
        id: `over-${volatility}-${Date.now()}`,
        volatility,
        tradeType: "Over 4.5",
        confidence: highPct,
        signal: highPct >= 70 ? "STRONG" : "TRADE NOW",
        marketPower: highPct - lowPct,
        patternStrength: 80,
        timestamp: Date.now(),
        lastDigits: last20,
        percentages: { high: highPct, low: lowPct, even: evenPct, odd: oddPct },
      })
    }

    if (lowPct >= 60) {
      signals.push({
        id: `under-${volatility}-${Date.now()}`,
        volatility,
        tradeType: "Under 4.5",
        confidence: lowPct,
        signal: lowPct >= 70 ? "STRONG" : "TRADE NOW",
        marketPower: lowPct - highPct,
        patternStrength: 80,
        timestamp: Date.now(),
        lastDigits: last20,
        percentages: { high: highPct, low: lowPct, even: evenPct, odd: oddPct },
      })
    }

    if (evenPct >= 60) {
      signals.push({
        id: `even-${volatility}-${Date.now()}`,
        volatility,
        tradeType: "Even",
        confidence: evenPct,
        signal: evenPct >= 70 ? "STRONG" : "TRADE NOW",
        marketPower: evenPct - oddPct,
        patternStrength: 85,
        timestamp: Date.now(),
        lastDigits: last20,
        percentages: { high: highPct, low: lowPct, even: evenPct, odd: oddPct },
      })
    }

    if (oddPct >= 60) {
      signals.push({
        id: `odd-${volatility}-${Date.now()}`,
        volatility,
        tradeType: "Odd",
        confidence: oddPct,
        signal: oddPct >= 70 ? "STRONG" : "TRADE NOW",
        marketPower: oddPct - evenPct,
        patternStrength: 85,
        timestamp: Date.now(),
        lastDigits: last20,
        percentages: { high: highPct, low: lowPct, even: evenPct, odd: oddPct },
      })
    }

    const digitCounts = new Array(10).fill(0)
    last20.forEach((d) => digitCounts[d]++)
    const leastFrequentIdx = digitCounts.indexOf(Math.min(...digitCounts))
    const leastFrequentPct = (digitCounts[leastFrequentIdx] / last20.length) * 100

    if (leastFrequentPct < 15) {
      signals.push({
        id: `differs-${volatility}-${Date.now()}`,
        volatility,
        tradeType: `Differs (${leastFrequentIdx})`,
        confidence: 100 - leastFrequentPct,
        signal: leastFrequentPct < 10 ? "STRONG" : "TRADE NOW",
        marketPower: 100 - leastFrequentPct,
        patternStrength: 88,
        timestamp: Date.now(),
        lastDigits: last20,
        percentages: { high: highPct, low: lowPct, even: evenPct, odd: oddPct },
      })
    }

    return signals.filter((s) => s.confidence >= 55)
  }

  const allSignals = Array.from(volatilityAnalyses.values()).flatMap((v) => v.signals)
  const totalSignals = allSignals.length
  const strongCount = allSignals.filter((s) => s.signal === "STRONG").length
  const avgConfidence = totalSignals > 0 ? allSignals.reduce((sum, s) => sum + s.confidence, 0) / totalSignals : 0

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
            Independent Volatility Signals
          </h2>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
              className={
                theme === "dark"
                  ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  : "border-blue-300 text-blue-600 hover:bg-blue-50"
              }
            >
              <ScrollText className="h-4 w-4 mr-2" />
              {showLogs ? "Hide Logs" : "Show Logs"}
            </Button>
            <Badge className="bg-emerald-500 text-white text-sm px-4 py-2 animate-pulse flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Live Monitoring
            </Badge>
          </div>
        </div>

        <p className={`text-sm mb-6 ${theme === "dark" ? "text-gray-400" : "text-gray-700"}`}>
          Each Deriv volatility (R_10, R_25, R_50, R_75, R_100) is analyzed completely independently with separate
          real-time data streams, generating unique signals updated every 3 seconds per volatility.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div
            className={`rounded-lg p-4 border ${theme === "dark" ? "bg-blue-500/10 border-blue-500/30" : "bg-blue-50 border-blue-200"}`}
          >
            <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Total Signals</div>
            <div className={`text-2xl font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
              {totalSignals}
            </div>
          </div>
          <div
            className={`rounded-lg p-4 border ${theme === "dark" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-emerald-50 border-emerald-200"}`}
          >
            <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Strong Signals</div>
            <div className={`text-2xl font-bold ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}>
              {strongCount}
            </div>
          </div>
          <div
            className={`rounded-lg p-4 border ${theme === "dark" ? "bg-purple-500/10 border-purple-500/30" : "bg-purple-50 border-purple-200"}`}
          >
            <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Avg Confidence</div>
            <div className={`text-2xl font-bold ${theme === "dark" ? "text-purple-400" : "text-purple-600"}`}>
              {avgConfidence.toFixed(1)}%
            </div>
          </div>
          <div
            className={`rounded-lg p-4 border ${theme === "dark" ? "bg-cyan-500/10 border-cyan-500/30" : "bg-cyan-50 border-cyan-200"}`}
          >
            <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Volatilities</div>
            <div className={`text-2xl font-bold ${theme === "dark" ? "text-cyan-400" : "text-cyan-600"}`}>
              {volatilityAnalyses.size}
            </div>
          </div>
        </div>

        {showLogs && (
          <div
            className={`mb-6 rounded-lg p-4 border ${theme === "dark" ? "bg-gray-900/50 border-gray-700" : "bg-gray-50 border-gray-200"} max-h-48 overflow-y-auto`}
          >
            <h3 className={`text-sm font-bold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-900"}`}>
              Scan Logs
            </h3>
            <div className="space-y-1">
              {scanLogs.length === 0 ? (
                <p className={`text-xs ${theme === "dark" ? "text-gray-500" : "text-gray-600"}`}>No logs yet...</p>
              ) : (
                scanLogs.map((log, index) => (
                  <p
                    key={index}
                    className={`text-xs font-mono ${theme === "dark" ? "text-gray-400" : "text-gray-700"}`}
                  >
                    {log}
                  </p>
                ))
              )}
            </div>
          </div>
        )}

        {totalSignals === 0 ? (
          <div className="text-center py-12">
            <Zap className={`h-16 w-16 mx-auto mb-4 ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`} />
            <p className={`text-lg ${theme === "dark" ? "text-gray-400" : "text-gray-700"}`}>
              Analyzing all volatilities independently...
            </p>
            <p className={`text-sm mt-2 ${theme === "dark" ? "text-gray-500" : "text-gray-600"}`}>
              Signals will appear when conditions are met across any volatility
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {VOLATILITIES.map((volatility) => {
              const volAnalysis = volatilityAnalyses.get(volatility)
              if (!volAnalysis || volAnalysis.signals.length === 0) return null

              return (
                <div key={volatility} className="space-y-3">
                  <h3
                    className={`text-lg font-bold flex items-center gap-2 ${theme === "dark" ? "text-cyan-400" : "text-cyan-600"}`}
                  >
                    <TrendingUp className="h-5 w-5" />
                    {VOLATILITY_LABELS[volatility]}
                    <Badge className="bg-blue-500/50 text-white text-xs">{volAnalysis.signals.length} signals</Badge>
                  </h3>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {volAnalysis.signals.map((signal) => (
                      <Card
                        key={signal.id}
                        className={`p-4 border-2 ${
                          signal.signal === "STRONG"
                            ? theme === "dark"
                              ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                              : "border-emerald-400 bg-gradient-to-br from-emerald-50 to-green-50 shadow-[0_8px_24px_rgba(16,185,129,0.2)]"
                            : theme === "dark"
                              ? "border-blue-500/50 bg-blue-500/10"
                              : "border-blue-300 bg-blue-50"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className={`text-base font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                              {signal.tradeType}
                            </h4>
                          </div>
                          <Badge
                            className={`${
                              signal.signal === "STRONG"
                                ? theme === "dark"
                                  ? "bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.6)] animate-pulse"
                                  : "bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-[0_4px_16px_rgba(16,185,129,0.4)]"
                                : theme === "dark"
                                  ? "bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                                  : "bg-blue-400 text-white"
                            }`}
                          >
                            {signal.signal}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                            Confidence:{" "}
                            <span className="font-bold text-emerald-400">{signal.confidence.toFixed(1)}%</span>
                          </div>
                          <div className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                            Power: <span className="font-bold text-cyan-400">{signal.marketPower.toFixed(1)}%</span>
                          </div>
                          <div className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                            Pattern: <span className="font-bold text-purple-400">{signal.patternStrength}%</span>
                          </div>
                          <div className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                            Digits:{" "}
                            <span className="font-bold text-blue-400">{signal.lastDigits.slice(-5).join(",")}</span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
