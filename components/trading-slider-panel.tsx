"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDerivAPI } from "@/lib/deriv-api-context"
import { useDerivAuth } from "@/hooks/use-deriv-auth"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TradingSliderPanelProps {
  theme: "light" | "dark"
  onTrade: (amount: number, contract: string) => Promise<void>
  isTrading: boolean
  balance?: number
  signal?: {
    type: string
    confidence: number
    contract: string
    entryPoint: string | number
  }
}

export function TradingSliderPanel({ theme, onTrade, isTrading, balance = 1000, signal }: TradingSliderPanelProps) {
  const [stakeAmount, setStakeAmount] = useState(1)
  const [isExecuting, setIsExecuting] = useState(false)
  const [selectedContractType, setSelectedContractType] = useState("DIGITOVER")
  const [stakeInput, setStakeInput] = useState("1")
  const { apiClient, isAuthorized } = useDerivAPI()
  const { token } = useDerivAuth()

  const maxStake = Math.floor(balance * 0.1)

  const handleStakeInputChange = (value: string) => {
    const num = Number.parseFloat(value) || 0
    const rounded = Math.round(num * 100) / 100
    setStakeInput(rounded.toString())
    setStakeAmount(rounded)
  }

  const handleQuickStake = (amount: number) => {
    const rounded = Math.round(amount * 100) / 100
    setStakeAmount(rounded)
    setStakeInput(rounded.toString())
  }

  const handleTrade = async () => {
    if (!signal || isExecuting || !isAuthorized) return
    setIsExecuting(true)
    try {
      await onTrade(stakeAmount, signal.contract)
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <Card
      className={`sticky bottom-0 z-40 ${
        theme === "dark"
          ? "bg-gradient-to-r from-[#0f1629]/95 to-[#1a2235]/95 border-blue-500/30 backdrop-blur-sm"
          : "bg-white/95 border-gray-200 backdrop-blur-sm"
      }`}
    >
      <CardHeader className="pb-3">
        <CardTitle className={`text-sm ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          Live Trading Panel {!isAuthorized && "⚠️ API Disconnected"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {signal && isAuthorized ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              <div>
                <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Signal</div>
                <Badge className="bg-emerald-500 text-white">{signal.type}</Badge>
              </div>
              <div>
                <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Confidence</div>
                <div className={`font-bold ${theme === "dark" ? "text-cyan-400" : "text-cyan-600"}`}>
                  {signal.confidence.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Entry</div>
                <div className={`font-bold ${theme === "dark" ? "text-orange-400" : "text-orange-600"}`}>
                  {signal.entryPoint}
                </div>
              </div>
              <div>
                <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Balance</div>
                <div className={`font-bold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                  {balance.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                Contract Type
              </label>
              <Select value={selectedContractType} onValueChange={setSelectedContractType}>
                <SelectTrigger className={theme === "dark" ? "bg-gray-800 border-gray-600 text-white" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIGITOVER">Over</SelectItem>
                  <SelectItem value="DIGITUNDER">Under</SelectItem>
                  <SelectItem value="DIGITEVEN">Even</SelectItem>
                  <SelectItem value="DIGITODD">Odd</SelectItem>
                  <SelectItem value="DIGITDIFF">Differs</SelectItem>
                  <SelectItem value="CALL">Rise</SelectItem>
                  <SelectItem value="PUT">Fall</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className={`text-sm font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  Stake Amount: {stakeAmount.toFixed(2)}
                </label>
                <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Max: {maxStake.toFixed(2)}
                </span>
              </div>
              <input
                type="number"
                value={stakeInput}
                onChange={(e) => handleStakeInputChange(e.target.value)}
                min="0.01"
                step="0.01"
                max={maxStake}
                className={`w-full px-3 py-2 rounded border text-sm ${
                  theme === "dark" ? "bg-gray-800 border-gray-600 text-white" : "bg-white border-gray-300 text-gray-900"
                }`}
              />
              <div className="flex gap-1 text-xs">
                {[1, 5, 10, 25].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => handleQuickStake(amt)}
                    className={`flex-1 py-1 rounded ${
                      theme === "dark"
                        ? "bg-gray-700 hover:bg-gray-600 text-white"
                        : "bg-gray-200 hover:bg-gray-300 text-gray-900"
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleTrade}
              disabled={isExecuting || isTrading}
              className={`w-full py-2 font-bold text-white ${
                isExecuting || isTrading
                  ? "bg-gray-500"
                  : "bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              }`}
            >
              {isExecuting
                ? "Executing Trade..."
                : isTrading
                  ? "Trading..."
                  : `Trade ${stakeAmount.toFixed(2)} - ${signal.type}`}
            </Button>
          </>
        ) : (
          <div className={`text-center text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            {!isAuthorized ? "Connect API token to enable trading" : "Waiting for trading signal..."}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
