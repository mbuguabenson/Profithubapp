"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { Signal, AnalysisResult } from "@/lib/analysis-engine"

interface ProSignalsTabProps {
  proSignals: Signal[]
  analysis: AnalysisResult | null
  theme?: "light" | "dark"
}

export function ProSignalsTab({ proSignals, analysis, theme = "dark" }: ProSignalsTabProps) {
  const [showStrategies, setShowStrategies] = useState(false)

  const strategies = [
    {
      name: "Under 7 Strategy",
      description:
        "Red & green bars should be below Digit 7 (i.e., on 6,5,4,3,2,1,0). Any 2 digits between 7,8 & 9 should be less than 10%. Entry: use the digit having more than 10% between Digits 7,8 & 9 as entry point.",
    },
    {
      name: "Over 2 Strategy",
      description:
        "Red & green bars should be above Digit 2 (i.e., on 3,4,5,6,7,8,9). Any 2 digits between 0,1 & 2 should be less than 10%. Entry: use the digit having more than 10% between Digits 0,1 & 2 as entry point.",
    },
  ]

  if (!proSignals || proSignals.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16">
          <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            No pro signals available yet. Pro signals require specific market conditions.
          </p>
        </div>

        <div
          className={`rounded-xl p-6 border ${
            theme === "dark"
              ? "bg-gradient-to-br from-purple-900/40 via-pink-900/30 to-amber-900/40 border-amber-500/30 shadow-[0_0_40px_rgba(217,119,6,0.3)]"
              : "bg-gradient-to-br from-purple-50 via-pink-50 to-amber-50 border-amber-300 shadow-xl"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3
              className={`text-xl font-bold ${theme === "dark" ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 bg-clip-text text-transparent" : "text-amber-900"}`}
            >
              Premium Strategies
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowStrategies(!showStrategies)}
              className={
                theme === "dark" ? "text-amber-400 hover:text-amber-300" : "text-amber-700 hover:text-amber-800"
              }
            >
              {showStrategies ? (
                <>
                  <ChevronUp className="w-5 h-5 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="w-5 h-5 mr-1" />
                  Show
                </>
              )}
            </Button>
          </div>

          {showStrategies && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {strategies.map((strategy, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    theme === "dark"
                      ? "bg-gradient-to-br from-amber-500/10 to-purple-500/10 border-amber-500/40 hover:border-amber-400/60 hover:shadow-[0_0_20px_rgba(217,119,6,0.4)]"
                      : "bg-gradient-to-br from-amber-50 to-purple-50 border-amber-300 hover:border-amber-400 hover:shadow-lg"
                  } transition-all`}
                >
                  <h4 className={`font-bold mb-2 ${theme === "dark" ? "text-amber-400" : "text-amber-700"}`}>
                    {strategy.name}
                  </h4>
                  <p className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                    {strategy.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {proSignals.map((signal, index) => (
        <div
          key={index}
          className={`rounded-xl p-6 border ${
            theme === "dark"
              ? "bg-gradient-to-br from-purple-900/40 via-pink-900/30 to-amber-900/40 border-amber-500/30 shadow-[0_0_40px_rgba(217,119,6,0.3)]"
              : "bg-gradient-to-br from-purple-50 via-pink-50 to-amber-50 border-amber-300 shadow-xl"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3
              className={`text-xl font-bold ${theme === "dark" ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 bg-clip-text text-transparent" : "text-amber-900"}`}
            >
              PRO {signal.type.replace("_", " / ").toUpperCase()}
            </h3>
            <Button
              size="lg"
              className={`px-8 py-6 text-lg font-bold ${
                signal.status === "TRADE NOW"
                  ? "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-[0_0_25px_rgba(34,197,94,0.6)] animate-pulse"
                  : signal.status === "WAIT"
                    ? "bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 shadow-[0_0_25px_rgba(234,179,8,0.6)]"
                    : "bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700"
              }`}
            >
              {signal.status}
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <div className={`text-sm font-semibold mb-2 ${theme === "dark" ? "text-amber-300" : "text-amber-700"}`}>
                Recommendation:
              </div>
              <div className={`text-lg ${theme === "dark" ? "text-yellow-300" : "text-amber-800"}`}>
                {signal.recommendation}
              </div>
            </div>

            <div>
              <div className={`text-sm font-semibold mb-2 ${theme === "dark" ? "text-amber-300" : "text-amber-700"}`}>
                Entry Condition:
              </div>
              <div className={`text-base ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                {signal.entryCondition}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <div className={`text-sm font-semibold mb-2 ${theme === "dark" ? "text-amber-300" : "text-amber-700"}`}>
                  Power
                </div>
                <Progress value={signal.probability} className="h-3" />
                <div className={`text-xs mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {signal.probability.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className={`text-sm font-semibold mb-2 ${theme === "dark" ? "text-amber-300" : "text-amber-700"}`}>
                  Confidence
                </div>
                <Progress value={Math.min(signal.probability * 0.95, 100)} className="h-3" />
                <div className={`text-xs mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {Math.min(signal.probability * 0.95, 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      <div
        className={`rounded-xl p-6 border ${
          theme === "dark"
            ? "bg-gradient-to-br from-purple-900/40 via-pink-900/30 to-amber-900/40 border-amber-500/30 shadow-[0_0_40px_rgba(217,119,6,0.3)]"
            : "bg-gradient-to-br from-purple-50 via-pink-50 to-amber-50 border-amber-300 shadow-xl"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className={`text-xl font-bold ${theme === "dark" ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 bg-clip-text text-transparent" : "text-amber-900"}`}
          >
            Premium Strategies
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowStrategies(!showStrategies)}
            className={theme === "dark" ? "text-amber-400 hover:text-amber-300" : "text-amber-700 hover:text-amber-800"}
          >
            {showStrategies ? (
              <>
                <ChevronUp className="w-5 h-5 mr-1" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="w-5 h-5 mr-1" />
                Show
              </>
            )}
          </Button>
        </div>

        {showStrategies && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {strategies.map((strategy, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  theme === "dark"
                    ? "bg-gradient-to-br from-amber-500/10 to-purple-500/10 border-amber-500/40 hover:border-amber-400/60 hover:shadow-[0_0_20px_rgba(217,119,6,0.4)]"
                    : "bg-gradient-to-br from-amber-50 to-purple-50 border-amber-300 hover:border-amber-400 hover:shadow-lg"
                } transition-all`}
              >
                <h4 className={`font-bold mb-2 ${theme === "dark" ? "text-amber-400" : "text-amber-700"}`}>
                  {strategy.name}
                </h4>
                <p className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  {strategy.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
