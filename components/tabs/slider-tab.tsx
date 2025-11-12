"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Play, Pause } from "lucide-react"

/**
 * Created new Slider Tab component
 * Provides Deriv Bot Simulator interface matching the reference design
 */

interface SliderTabProps {
  theme?: "light" | "dark"
}

export function SliderTab({ theme = "dark" }: SliderTabProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [activeTab, setActiveTab] = useState("config")

  // Config state
  const [market, setMarket] = useState("R_100")
  const [symbol, setSymbol] = useState("---")
  const [tradeCategory, setTradeCategory] = useState("")
  const [contractType, setContractType] = useState("")
  const [baseStake, setBaseStake] = useState("0.35")
  const [duration, setDuration] = useState("5")
  const [martingaleMultiplier, setMartingaleMultiplier] = useState("1.5")
  const [takeProfit, setTakeProfit] = useState("2")
  const [stopLoss, setStopLoss] = useState("0.35")
  const [currentStake, setCurrentStake] = useState("0.35")

  // Status state
  const [status, setStatus] = useState("Connecting")
  const [balance, setBalance] = useState("$0.00")
  const [accountStatus, setAccountStatus] = useState("N/A")

  // Transaction state
  const [transactions, setTransactions] = useState<
    Array<{
      id: string
      type: string
      entry: string
      stake: string
      pnl: string
    }>
  >([])

  const handleRun = () => {
    setIsRunning(true)
    setStatus("Running")
  }

  const handlePause = () => {
    setIsRunning(false)
    setStatus("Paused")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card
        className={`p-6 border ${
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-teal-500/20"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          <div className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            Deriv Bot Simulator
          </div>
          <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>App ID: 106629</div>
        </div>

        {/* Status Row */}
        <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-teal-500/20">
          <div>
            <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Status</div>
            <div className={`text-lg font-bold ${status === "Running" ? "text-emerald-400" : "text-yellow-400"}`}>
              {status}
            </div>
          </div>
          <div>
            <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Account</div>
            <div className={`text-lg font-bold ${theme === "dark" ? "text-cyan-400" : "text-cyan-600"}`}>
              {accountStatus}
            </div>
          </div>
          <div>
            <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Balance</div>
            <div className={`text-lg font-bold ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}>
              {balance}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {["Bot Config", "Transactions", "History"].map((tab) => (
            <Button
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase().replace(" ", "-"))}
              variant={activeTab === tab.toLowerCase().replace(" ", "-") ? "default" : "outline"}
              className={`${
                activeTab === tab.toLowerCase().replace(" ", "-")
                  ? theme === "dark"
                    ? "bg-blue-500 text-white"
                    : "bg-blue-600 text-white"
                  : theme === "dark"
                    ? "bg-gray-800 text-gray-300 border-gray-600"
                    : "bg-gray-100 text-gray-700 border-gray-300"
              }`}
            >
              {tab}
            </Button>
          ))}
        </div>
      </Card>

      {/* Bot Config Tab */}
      {activeTab === "bot-config" && (
        <Card
          className={`p-6 border ${
            theme === "dark"
              ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-teal-500/20"
              : "bg-white border-gray-200"
          }`}
        >
          <div className="space-y-6">
            {/* Market & Symbol */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Market
                </label>
                <Select value={market} onValueChange={setMarket}>
                  <SelectTrigger
                    className={`${
                      theme === "dark"
                        ? "bg-gray-800 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="R_100">Volatility 100</SelectItem>
                    <SelectItem value="R_50">Volatility 50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Symbol
                </label>
                <Input
                  value={symbol}
                  readOnly
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-gray-400"
                      : "bg-gray-100 border-gray-300 text-gray-600"
                  }`}
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Barrier/Prediction
                </label>
                <Input
                  value="N/A"
                  readOnly
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-gray-400"
                      : "bg-gray-100 border-gray-300 text-gray-600"
                  }`}
                />
              </div>
            </div>

            {/* Trade Category & Contract */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Trade Category
                </label>
                <Select value={tradeCategory} onValueChange={setTradeCategory}>
                  <SelectTrigger
                    className={`${
                      theme === "dark"
                        ? "bg-gray-800 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                  >
                    <SelectValue placeholder="Loading..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="digits">Digits</SelectItem>
                    <SelectItem value="over-under">Over/Under</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Contract
                </label>
                <Select value={contractType} onValueChange={setContractType}>
                  <SelectTrigger
                    className={`${
                      theme === "dark"
                        ? "bg-gray-800 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                  >
                    <SelectValue placeholder="Select contract" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="matches">Matches</SelectItem>
                    <SelectItem value="differs">Differs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                >
                  Barrier/Prediction
                </label>
                <Input
                  value="N/A"
                  readOnly
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-gray-400"
                      : "bg-gray-100 border-gray-300 text-gray-600"
                  }`}
                />
              </div>
            </div>

            {/* Stakes & Parameters */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Base Stake
                </label>
                <Input
                  type="number"
                  value={baseStake}
                  onChange={(e) => setBaseStake(e.target.value)}
                  step="0.01"
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Duration (Ticks)
                </label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Martingale Multiplier
                </label>
                <Input
                  type="number"
                  value={martingaleMultiplier}
                  onChange={(e) => setMartingaleMultiplier(e.target.value)}
                  step="0.1"
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-cyan-400" : "text-cyan-600"}`}
                >
                  Current Stake
                </label>
                <Input
                  type="number"
                  value={currentStake}
                  readOnly
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-cyan-400"
                      : "bg-gray-100 border-gray-300 text-cyan-600"
                  }`}
                />
              </div>
            </div>

            {/* Profit & Loss */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Take Profit ($)
                </label>
                <Input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  step="0.1"
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
                >
                  Stop Loss ($)
                </label>
                <Input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  step="0.01"
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                >
                  Contract Value
                </label>
                <Input
                  value="---"
                  readOnly
                  className={`${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-gray-400"
                      : "bg-gray-100 border-gray-300 text-gray-600"
                  }`}
                />
              </div>
            </div>

            {/* Info Messages */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Symbol: **N/A**</div>
              <div className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>Contract: **N/A**</div>
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              <Button
                onClick={handleRun}
                disabled={isRunning}
                className={`flex-1 ${
                  isRunning ? "bg-gray-500 cursor-not-allowed" : "bg-teal-500 hover:bg-teal-600"
                } text-white font-bold`}
              >
                <Play className="w-4 h-4 mr-2" />
                Run
              </Button>
              <Button
                onClick={handlePause}
                disabled={!isRunning}
                className={`flex-1 ${
                  isRunning ? "bg-gray-600 hover:bg-gray-700" : "bg-gray-500 cursor-not-allowed"
                } text-white font-bold`}
              >
                <Pause className="w-4 h-4 mr-2" />
                Bot Paused
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Transactions Tab */}
      {activeTab === "transactions" && (
        <Card
          className={`p-6 border ${
            theme === "dark"
              ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-teal-500/20"
              : "bg-white border-gray-200"
          }`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm font-semibold mb-4 pb-4 border-b border-teal-500/20">
              <div className={theme === "dark" ? "text-cyan-400" : "text-cyan-600"}>ID/Type</div>
              <div className={theme === "dark" ? "text-cyan-400" : "text-cyan-600"}>Entry/Exit Spot</div>
              <div className={theme === "dark" ? "text-cyan-400" : "text-cyan-600"}>Stake/P&L</div>
            </div>

            {transactions.length === 0 ? (
              <div className={`text-center py-8 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                No transactions recorded yet.
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="grid grid-cols-3 gap-4 text-sm py-3 border-b border-gray-700/30">
                  <div className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>{tx.type}</div>
                  <div className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>{tx.entry}</div>
                  <div className={`font-bold ${tx.pnl.startsWith("+") ? "text-green-400" : "text-red-400"}`}>
                    {tx.pnl}
                  </div>
                </div>
              ))
            )}

            <div className="mt-6 pt-4 border-t border-teal-500/20 grid grid-cols-3 gap-4">
              <div>
                <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Total stake</div>
                <div className={`font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>0.00 USD</div>
              </div>
              <div>
                <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Contracts won</div>
                <div className={`font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>0</div>
              </div>
              <div>
                <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Total profit/loss
                </div>
                <div className={`font-bold text-emerald-400`}>+0.00 USD</div>
              </div>
            </div>

            <Button
              className={`w-full mt-4 border ${
                theme === "dark"
                  ? "border-teal-500/50 text-teal-400 hover:bg-teal-500/10"
                  : "border-teal-500 text-teal-600 hover:bg-teal-50"
              }`}
              variant="outline"
            >
              Reset Transactions & History
            </Button>
          </div>
        </Card>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <Card
          className={`p-6 border ${
            theme === "dark"
              ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-teal-500/20"
              : "bg-white border-gray-200"
          }`}
        >
          <div className={`text-center py-12 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>System Initialized. Attempting to connect to the Deriv API...</p>
            <p className={`text-xs mt-4 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
              2025-11-07 | 03:35:54 GMT
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
