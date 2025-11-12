"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Play, Square, TrendingUp, TrendingDown, Activity, Settings, ChevronDown, ChevronUp } from "lucide-react"

import { useStrategyManager } from "@/hooks/use-strategy-manager"
import { useGlobalTradingContext } from "@/hooks/use-global-trading-context"

interface StrategyConfig {
  id: string
  name: string
  type: "DIFFERS" | "OVER3_UNDER6" | "OVER2_UNDER7" | "OVER1_UNDER8" | "EVEN_ODD"
  description: string
  enabled: boolean
  marketSymbol: string
  analysisMinutes: number
  stake: number
  martingaleMultiplier: number
  ticksPerTrade: number
  targetProfit: number
  stopLoss: number
  autoRestart: boolean
  retryDelay: number
  state: "idle" | "analysing" | "trading" | "paused" | "error"
}

interface StrategyStats {
  sampleSize: number
  digitFrequencies: Record<number, number>
  overPercent: number
  underPercent: number
  evenPercent: number
  oddPercent: number
  decisionState: "WAIT" | "TRADE_NOW" | "STRONG" | "TRADING"
  lastDigits: number[]
  momentum: "rising" | "falling" | "stable"
  power: number
}

interface TradeLog {
  id: string
  timestamp: number
  contractId: string
  proposalId: string
  buyPrice: number
  payout: number
  result: "win" | "loss" | "pending"
  profit: number
  entryTick: number
  exitTick?: number
}

const STRATEGY_CONFIGS: Partial<StrategyConfig>[] = [
  {
    type: "DIFFERS",
    name: "Differs Bot",
    description: "Targets digits 2-7 with <10% frequency. Trades after 3 consecutive absences.",
    martingaleMultiplier: 2.6,
    ticksPerTrade: 1,
  },
  {
    type: "OVER3_UNDER6",
    name: "Over3/Under6 Bot",
    description: "Over3={4-9}, Under6={0-5}. Trades at 55%+ power with momentum.",
    martingaleMultiplier: 3.6,
    ticksPerTrade: 1,
  },
  {
    type: "OVER2_UNDER7",
    name: "Over2/Under7 Bot",
    description: "Over2={3-9}, Under7={0-6}. Predicts next 10-20 ticks distribution.",
    martingaleMultiplier: 4.5,
    ticksPerTrade: 1,
  },
  {
    type: "OVER1_UNDER8",
    name: "Over1/Under8 Bot",
    description: "Over1={2-9}, Under8={0-7}. Advanced power dynamics mapping.",
    martingaleMultiplier: 6.5,
    ticksPerTrade: 1,
  },
  {
    type: "EVEN_ODD",
    name: "Even/Odd Advanced",
    description: "Multi-level signal analysis with short & medium-term trends.",
    martingaleMultiplier: 2.1,
    ticksPerTrade: 1,
  },
]

function StrategyPanel({
  config,
  stats,
  trades,
  onUpdate,
  onStart,
  onStop,
  theme,
}: {
  config: StrategyConfig
  stats: StrategyStats | null
  trades: TradeLog[]
  onUpdate: (config: Partial<StrategyConfig>) => void
  onStart: () => void
  onStop: () => void
  theme: "light" | "dark"
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const sessionProfit = trades.reduce((sum, t) => sum + (t.result !== "pending" ? t.profit : 0), 0)
  const winRate =
    trades.length > 0
      ? (trades.filter((t) => t.result === "win").length / trades.filter((t) => t.result !== "pending").length) * 100
      : 0

  return (
    <Card
      className={`p-4 border ${
        theme === "dark"
          ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
          : "bg-white border-gray-200"
      } ${config.state === "trading" ? "glow-card-active shadow-[0_0_30px_rgba(34,197,94,0.3)]" : ""}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className={theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <div>
            <h3 className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>{config.name}</h3>
            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={config.enabled} onCheckedChange={(enabled) => onUpdate({ enabled })} />
          <Badge
            className={
              config.state === "trading"
                ? "bg-green-500/20 text-green-400 border-green-500/30"
                : config.state === "analysing"
                  ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                  : config.state === "error"
                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                    : "bg-gray-500/20 text-gray-400 border-gray-500/30"
            }
          >
            {config.state.toUpperCase()}
          </Badge>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {/* Settings Section */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className={`gap-2 ${theme === "dark" ? "border-blue-500/30 text-blue-400" : ""}`}
            >
              <Settings className="h-4 w-4" />
              {showSettings ? "Hide Settings" : "Show Settings"}
            </Button>
            <div className="flex gap-2">
              {config.state === "idle" || config.state === "paused" ? (
                <Button
                  onClick={onStart}
                  disabled={!config.enabled}
                  className="gap-2 bg-green-500 hover:bg-green-600 text-white"
                >
                  <Play className="h-4 w-4" />
                  Start Analysis
                </Button>
              ) : (
                <Button onClick={onStop} className="gap-2 bg-red-500 hover:bg-red-600 text-white">
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              )}
            </div>
          </div>

          {showSettings && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 border rounded-lg bg-black/20">
              <div>
                <Label className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>Market Symbol</Label>
                <Select value={config.marketSymbol} onValueChange={(marketSymbol) => onUpdate({ marketSymbol })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="R_10">Volatility 10 Index</SelectItem>
                    <SelectItem value="R_25">Volatility 25 Index</SelectItem>
                    <SelectItem value="R_50">Volatility 50 Index</SelectItem>
                    <SelectItem value="R_75">Volatility 75 Index</SelectItem>
                    <SelectItem value="R_100">Volatility 100 Index</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>Analysis Time (min)</Label>
                <Input
                  type="number"
                  value={config.analysisMinutes}
                  onChange={(e) => onUpdate({ analysisMinutes: Number(e.target.value) })}
                  min={1}
                  max={60}
                />
              </div>
              <div>
                <Label className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>Stake (USD)</Label>
                <Input
                  type="number"
                  value={config.stake}
                  onChange={(e) => onUpdate({ stake: Number(e.target.value) })}
                  min={0.35}
                  step={0.1}
                />
              </div>
              <div>
                <Label className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>Martingale Multiplier</Label>
                <Input
                  type="number"
                  value={config.martingaleMultiplier}
                  onChange={(e) => onUpdate({ martingaleMultiplier: Number(e.target.value) })}
                  min={1}
                  step={0.1}
                />
              </div>
              <div>
                <Label className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>Ticks Per Trade</Label>
                <Input
                  type="number"
                  value={config.ticksPerTrade}
                  onChange={(e) => onUpdate({ ticksPerTrade: Number(e.target.value) })}
                  min={1}
                  max={10}
                />
              </div>
              <div>
                <Label className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>Target Profit (USD)</Label>
                <Input
                  type="number"
                  value={config.targetProfit}
                  onChange={(e) => onUpdate({ targetProfit: Number(e.target.value) })}
                  min={1}
                />
              </div>
              <div>
                <Label className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>Stop Loss (USD)</Label>
                <Input
                  type="number"
                  value={config.stopLoss}
                  onChange={(e) => onUpdate({ stopLoss: Number(e.target.value) })}
                  min={1}
                />
              </div>
              <div>
                <Label className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>Retry Delay (sec)</Label>
                <Input
                  type="number"
                  value={config.retryDelay}
                  onChange={(e) => onUpdate({ retryDelay: Number(e.target.value) })}
                  min={1}
                  max={60}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={config.autoRestart} onCheckedChange={(autoRestart) => onUpdate({ autoRestart })} />
                <Label className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>Auto-Restart</Label>
              </div>
            </div>
          )}

          {/* Live Stats */}
          {stats && (config.state === "analysing" || config.state === "trading") && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <div className={`text-2xl font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                    {stats.sampleSize}
                  </div>
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Sample Size</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className={`text-2xl font-bold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                    {stats.power.toFixed(1)}%
                  </div>
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Power Index</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <div className={`text-2xl font-bold ${theme === "dark" ? "text-orange-400" : "text-orange-600"}`}>
                    {stats.overPercent.toFixed(1)}%
                  </div>
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Over</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                  <div className={`text-2xl font-bold ${theme === "dark" ? "text-purple-400" : "text-purple-600"}`}>
                    {stats.underPercent.toFixed(1)}%
                  </div>
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Under</div>
                </div>
              </div>

              {/* Decision State */}
              <div className="text-center p-4 rounded-lg border-2 animate-pulse">
                <Badge
                  className={`text-lg px-4 py-2 ${
                    stats.decisionState === "WAIT"
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : stats.decisionState === "TRADE_NOW"
                        ? "bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.5)]"
                        : stats.decisionState === "STRONG"
                          ? "bg-orange-500/20 text-orange-400 border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.5)]"
                          : "bg-red-500/20 text-red-400 border-red-500/30"
                  }`}
                >
                  {stats.decisionState}
                </Badge>
              </div>

              {/* Last Digits Visualization */}
              <div>
                <Label className={`text-sm mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  Last 8 Digits
                </Label>
                <div className="flex gap-2 justify-center">
                  {stats.lastDigits.slice(-8).map((digit, i) => (
                    <div
                      key={i}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold text-lg ${
                        theme === "dark"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "bg-blue-100 text-blue-600 border border-blue-300"
                      }`}
                    >
                      {digit}
                    </div>
                  ))}
                </div>
              </div>

              {/* Digit Frequencies */}
              <div>
                <Label className={`text-sm mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  Digit Frequencies
                </Label>
                <div className="grid grid-cols-5 gap-2">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                    <div key={digit} className="text-center p-2 rounded bg-black/20">
                      <div className={`text-lg font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                        {digit}
                      </div>
                      <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                        {stats.digitFrequencies[digit] || 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Session Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border rounded-lg bg-black/10">
            <div className="text-center">
              <div className={`text-2xl font-bold ${sessionProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                {sessionProfit >= 0 ? "+" : ""}${sessionProfit.toFixed(2)}
              </div>
              <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Session P&L</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                {trades.length}
              </div>
              <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Total Trades</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                {winRate.toFixed(1)}%
              </div>
              <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Win Rate</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${theme === "dark" ? "text-orange-400" : "text-orange-600"}`}>
                {trades.filter((t) => t.result === "win").length}W / {trades.filter((t) => t.result === "loss").length}L
              </div>
              <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>W/L</div>
            </div>
          </div>

          {/* Recent Trades */}
          {trades.length > 0 && (
            <div>
              <Label className={`text-sm mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Recent Trades (Last 5)
              </Label>
              <div className="space-y-2">
                {trades
                  .slice(-5)
                  .reverse()
                  .map((trade) => (
                    <div
                      key={trade.id}
                      className={`p-3 rounded-lg border ${
                        theme === "dark" ? "bg-black/20 border-gray-700" : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {trade.result === "win" ? (
                            <TrendingUp className="h-4 w-4 text-green-400" />
                          ) : trade.result === "loss" ? (
                            <TrendingDown className="h-4 w-4 text-red-400" />
                          ) : (
                            <Activity className="h-4 w-4 text-blue-400 animate-pulse" />
                          )}
                          <span className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                            {new Date(trade.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                            ${trade.buyPrice.toFixed(2)}
                          </span>
                          <Badge
                            className={
                              trade.result === "win"
                                ? "bg-green-500/20 text-green-400"
                                : trade.result === "loss"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-blue-500/20 text-blue-400"
                            }
                          >
                            {trade.result === "pending"
                              ? "PENDING"
                              : `${trade.profit >= 0 ? "+" : ""}$${trade.profit.toFixed(2)}`}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export function StrategiesTab({ theme }: { theme: "light" | "dark" }) {
  const { isAuthorized } = useGlobalTradingContext()
  const { strategies, stats, trades, registerStrategy, updateStrategy, startStrategy, stopStrategy } =
    useStrategyManager()

  useEffect(() => {
    STRATEGY_CONFIGS.forEach((config, index) => {
      registerStrategy({
        id: `strategy-${index}`,
        name: config.name!,
        type: config.type!,
        description: config.description!,
        enabled: false,
        marketSymbol: "R_100",
        analysisMinutes: 2,
        stake: 1,
        martingaleMultiplier: config.martingaleMultiplier!,
        ticksPerTrade: config.ticksPerTrade!,
        targetProfit: 10,
        stopLoss: 20,
        autoRestart: true,
        retryDelay: 5,
        state: "idle",
      })
    })
  }, [registerStrategy])

  if (!isAuthorized) {
    return (
      <div className="space-y-6">
        <div
          className={`p-6 rounded-xl border text-center ${
            theme === "dark"
              ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
              : "bg-white border-gray-200"
          }`}
        >
          <h2 className={`text-2xl font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            Please Log In
          </h2>
          <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            You must be logged in with Deriv OAuth to use the Strategy Trading Hub.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div
        className={`p-6 rounded-xl border ${
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
            : "bg-white border-gray-200"
        }`}
      >
        <h2 className={`text-2xl font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          Strategy Trading Hub
        </h2>
        <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          Configure and run multiple trading strategies simultaneously. Each strategy analyzes market data in real-time
          and automatically executes trades when conditions are met.
        </p>
      </div>

      <div className="space-y-4">
        {strategies.map((strategy) => (
          <StrategyPanel
            key={strategy.id}
            config={strategy}
            stats={stats.get(strategy.id) || null}
            trades={trades.get(strategy.id) || []}
            onUpdate={(updates) => updateStrategy(strategy.id, updates)}
            onStart={() => startStrategy(strategy.id)}
            onStop={() => stopStrategy(strategy.id)}
            theme={theme}
          />
        ))}
      </div>
    </div>
  )
}
