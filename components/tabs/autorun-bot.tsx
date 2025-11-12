"use client"
import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TradingStatsPanel } from "@/components/trading-stats-panel"
import { TransactionHistory } from "@/components/transaction-history"
import { TradingJournalPanel } from "@/components/trading-journal-panel"
import type { TradingJournal } from "@/lib/trading-journal"
import { Play, Square } from "lucide-react"
import { TPSLModal } from "@/components/tp-sl-modal"
import { AutoBot, type BotStrategy, type AutoBotConfig, type AutoBotState } from "@/lib/autobots"

interface AutoRunBotProps {
  apiClient: any
  isAuthorized: boolean
  balance: number
  currency: string
  theme: string
  activeSymbols: any[]
  contractsCache: Record<string, any>
  journal?: TradingJournal
  selectedSymbol: string
}

interface TradeRecord {
  id: string
  contractType: string
  market: string
  entry: string
  stake: number
  pl: number
  payout: number
  timestamp: number
  entrySpot?: string
  exitSpot?: string
}

interface LogEntry {
  time: string
  message: string
  type: "info" | "success" | "error" | "warn"
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

export function AutoRunBot({
  apiClient,
  isAuthorized,
  balance,
  currency,
  theme,
  activeSymbols,
  contractsCache,
  journal,
  selectedSymbol: propSelectedSymbol,
}: AutoRunBotProps) {
  const [market, setMarket] = useState(propSelectedSymbol || "1HZ100V")
  const [strategy, setStrategy] = useState<BotStrategy>("EVEN_ODD")
  const [stake, setStake] = useState(0.35)
  const [duration, setDuration] = useState(1)
  const [martingale, setMartingale] = useState(2.1)
  const [sl, setSL] = useState(50)
  const [tp, setTP] = useState(100)
  const [historyCount, setHistoryCount] = useState(50)
  const [cooldownMs, setCooldownMs] = useState(2000)
  const [maxTradesPerMinute, setMaxTradesPerMinute] = useState(10)
  const [isRunning, setIsRunning] = useState(false)
  const [botStatus, setBotStatus] = useState("Idle")
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([])
  const [journalLog, setJournalLog] = useState<LogEntry[]>([])
  const [activeSubTab, setActiveSubTab] = useState("stats")
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
  const [tpslModal, setTPSLModal] = useState<{
    isOpen: boolean
    type: "tp" | "sl"
    amount: number
  }>({
    isOpen: false,
    type: "tp",
    amount: 0,
  })

  const botRef = useRef<AutoBot | null>(null)

  useEffect(() => {
    if (propSelectedSymbol && market !== propSelectedSymbol) {
      // If symbol changes while running, stop the bot
      if (botRef.current) {
        botRef.current.stop()
        botRef.current = null
        setIsRunning(false)
        setBotStatus("Stopped - Symbol changed")
      }
    }
  }, [propSelectedSymbol, market])

  const logJournal = useCallback(
    (message: string, type: "info" | "success" | "error" | "warn" = "info") => {
      const time = new Date().toLocaleTimeString()
      setJournalLog((prev) => [{ time, message, type }, ...prev].slice(0, 200))

      if (journal) {
        journal.addEntry({
          type: "TRADE",
          action: type === "success" ? "WIN" : type === "error" ? "LOSS" : "INFO",
          stake,
          profit: 0,
          contractType: strategy,
          market,
          strategy: "AutoRun",
        })
      }
    },
    [journal, strategy, market, stake],
  )

  const startBot = useCallback(async () => {
    if (!apiClient || !isAuthorized || botRef.current) return

    try {
      const config: AutoBotConfig = {
        symbol: market,
        historyCount,
        duration,
        durationUnit: "t",
        tpPercent: (tp / balance) * 100,
        slPercent: (sl / balance) * 100,
        useMartingale: martingale > 1,
        martingaleMultiplier: martingale,
        cooldownMs,
        maxTradesPerMinute,
        initialStake: stake,
        balance,
      }

      logJournal(`Starting AutoBot with ${strategy} strategy on ${market}`, "info")

      const bot = new AutoBot(apiClient, strategy, config)
      botRef.current = bot

      await bot.start((state: AutoBotState) => {
        setStats({
          totalWins: state.wins,
          totalLosses: state.losses,
          totalProfit: state.profitLoss,
          winRate: state.wins > 0 ? (state.wins / state.totalRuns) * 100 : 0,
          totalStake: state.currentStake * state.totalRuns,
          totalPayout: 0,
          numberOfRuns: state.totalRuns,
          contractsLost: state.losses,
          contractsWon: state.wins,
        })

        if (state.trades.length > tradeHistory.length) {
          const newTrades = state.trades.slice(0, state.trades.length - tradeHistory.length)
          setTradeHistory((prev) => [
            ...newTrades.map((t) => ({
              id: t.id,
              contractType: t.contract,
              market,
              entry: new Date(t.timestamp).toLocaleTimeString(),
              stake: t.stake,
              pl: t.profitLoss,
              payout: t.stake + t.profitLoss,
              timestamp: t.timestamp,
            })),
            ...prev,
          ])
        }

        if (!state.isRunning) {
          if (state.profitLoss >= tp) {
            setTPSLModal({
              isOpen: true,
              type: "tp",
              amount: state.profitLoss,
            })
          } else if (state.profitLoss <= -sl) {
            setTPSLModal({
              isOpen: true,
              type: "sl",
              amount: Math.abs(state.profitLoss),
            })
          }
          setIsRunning(false)
          setBotStatus("Stopped")
          botRef.current = null
        } else {
          setBotStatus(`Running - ${state.totalRuns} trades`)
        }
      })

      setIsRunning(true)
      setBotStatus("Running")
    } catch (error: any) {
      logJournal(`Failed to start AutoBot: ${error.message}`, "error")
      setBotStatus("Error")
      botRef.current = null
    }
  }, [
    apiClient,
    isAuthorized,
    market,
    strategy,
    stake,
    duration,
    martingale,
    tp,
    sl,
    balance,
    historyCount,
    cooldownMs,
    maxTradesPerMinute,
    logJournal,
    tradeHistory.length,
  ])

  const stopBot = useCallback(() => {
    if (botRef.current) {
      botRef.current.stop()
      botRef.current = null
      setIsRunning(false)
      setBotStatus("Stopped")
      logJournal("AutoBot stopped by user", "info")
    }
  }, [logJournal])

  const toggleBot = useCallback(() => {
    if (isRunning) {
      stopBot()
    } else {
      startBot()
    }
  }, [isRunning, startBot, stopBot])

  useEffect(() => {
    return () => {
      if (botRef.current) {
        botRef.current.stop()
      }
    }
  }, [])

  const strategyDescriptions: Record<BotStrategy, string> = {
    EVEN_ODD: "Trades EVEN/ODD when 56%+ trend detected",
    EVEN_ODD_ADVANCED: "Advanced EVEN/ODD with 60%+ threshold",
    OVER1_UNDER8: "Trades OVER1/UNDER8 range",
    OVER2_UNDER7: "Trades OVER2/UNDER7 range",
    OVER3_UNDER6: "Trades OVER3/UNDER6 range",
    UNDER6: "Trades UNDER6 when 50%+ detected",
    DIFFERS: "Trades DIFFERS on rarest digits (2-7)",
    OVER_UNDER_ADVANCED: "Advanced OVER/UNDER with multi-level signals",
  }

  return (
    <div className="space-y-4">
      <TPSLModal
        isOpen={tpslModal.isOpen}
        type={tpslModal.type}
        amount={tpslModal.amount}
        currency={currency}
        onClose={() => setTPSLModal({ ...tpslModal, isOpen: false })}
      />

      <div
        className={`p-4 rounded-lg border ${theme === "dark" ? "bg-[#0a0e27]/50 border-blue-500/20" : "bg-gray-50 border-gray-200"}`}
      >
        <h3 className={`text-sm font-bold mb-4 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          AutoRun Configuration - Continuous Trading
        </h3>

        <div className="space-y-3">
          <div>
            <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
              Bot Strategy
            </Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as BotStrategy)} disabled={isRunning}>
              <SelectTrigger
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={theme === "dark" ? "bg-[#0a0e27] border-blue-500/30" : "bg-white"}>
                <SelectItem value="EVEN_ODD" className="text-xs">
                  Even/Odd
                </SelectItem>
                <SelectItem value="EVEN_ODD_ADVANCED" className="text-xs">
                  Even/Odd Advanced
                </SelectItem>
                <SelectItem value="OVER1_UNDER8" className="text-xs">
                  Over 1 / Under 8
                </SelectItem>
                <SelectItem value="OVER2_UNDER7" className="text-xs">
                  Over 2 / Under 7
                </SelectItem>
                <SelectItem value="OVER3_UNDER6" className="text-xs">
                  Over 3 / Under 6
                </SelectItem>
                <SelectItem value="UNDER6" className="text-xs">
                  Under 6
                </SelectItem>
                <SelectItem value="DIFFERS" className="text-xs">
                  Differs (Rarest)
                </SelectItem>
                <SelectItem value="OVER_UNDER_ADVANCED" className="text-xs">
                  Over/Under Advanced
                </SelectItem>
              </SelectContent>
            </Select>
            <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
              {strategyDescriptions[strategy]}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Initial Stake ($)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={stake}
                onChange={(e) => setStake(Number.parseFloat(e.target.value))}
                disabled={isRunning}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>

            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Duration (Ticks)
              </Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number.parseInt(e.target.value))}
                disabled={isRunning}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>

            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Martingale
              </Label>
              <Input
                type="number"
                step="0.1"
                value={martingale}
                onChange={(e) => setMartingale(Number.parseFloat(e.target.value))}
                disabled={isRunning}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>

            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                History Count
              </Label>
              <Input
                type="number"
                value={historyCount}
                onChange={(e) => setHistoryCount(Number.parseInt(e.target.value))}
                disabled={isRunning}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>

            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Stop Loss ($)
              </Label>
              <Input
                type="number"
                value={sl}
                onChange={(e) => setSL(Number.parseInt(e.target.value))}
                disabled={isRunning}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>

            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Take Profit ($)
              </Label>
              <Input
                type="number"
                value={tp}
                onChange={(e) => setTP(Number.parseInt(e.target.value))}
                disabled={isRunning}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>

            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Cooldown (ms)
              </Label>
              <Input
                type="number"
                value={cooldownMs}
                onChange={(e) => setCooldownMs(Number.parseInt(e.target.value))}
                disabled={isRunning}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>

            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Max Trades/Min
              </Label>
              <Input
                type="number"
                value={maxTradesPerMinute}
                onChange={(e) => setMaxTradesPerMinute(Number.parseInt(e.target.value))}
                disabled={isRunning}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={toggleBot}
          disabled={!isAuthorized}
          className={`flex-1 h-11 text-sm font-bold ${isRunning ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}
        >
          {isRunning ? (
            <>
              <Square className="w-4 h-4 mr-2" />
              Stop AutoBot
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run AutoBot
            </>
          )}
        </Button>
      </div>

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

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
        <TabsList className={`grid w-full grid-cols-3 ${theme === "dark" ? "bg-[#0f1629]/50" : "bg-gray-100"}`}>
          <TabsTrigger value="stats" className="text-xs">
            Summary
          </TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs">
            Transactions
          </TabsTrigger>
          <TabsTrigger value="journal" className="text-xs">
            Journal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="mt-3">
          <div
            className={`p-4 rounded-lg border ${theme === "dark" ? "bg-[#0a0e27]/50 border-blue-500/20" : "bg-gray-50 border-gray-200"}`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold ${botStatus === "Idle" ? "text-green-400" : botStatus === "Running" ? "text-yellow-400" : "text-red-400"}`}
              >
                Status: {botStatus}
              </span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-3">
          <TransactionHistory
            transactions={tradeHistory.map((t) => ({
              id: t.id,
              contractType: t.contractType,
              market: t.market,
              entrySpot: t.entrySpot || "N/A",
              exitSpot: t.exitSpot || "N/A",
              buyPrice: t.stake,
              profitLoss: t.pl,
              timestamp: t.timestamp,
              status: t.pl >= 0 ? "win" : "loss",
            }))}
            theme={theme}
          />
        </TabsContent>

        <TabsContent value="journal" className="mt-3">
          <TradingJournalPanel entries={journalLog} theme={theme} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
