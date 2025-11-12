"use client"
import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TradeExecutor } from "@/lib/trade-executor"
import { TradingStatsPanel } from "@/components/trading-stats-panel"
import { TransactionHistory } from "@/components/transaction-history"
import { TradingJournalPanel } from "@/components/trading-journal-panel"
import { TPSLModal } from "@/components/tp-sl-modal"
import type { TradingJournal } from "@/lib/trading-journal"

interface ManualTraderProps {
  apiClient: any
  isAuthorized: boolean
  balance: number
  currency: string
  theme: string
  activeSymbols: any[]
  contractsCache: Record<string, any>
  journal?: TradingJournal
  selectedSymbol?: string
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

const TRADE_TYPES = {
  DIGITS: {
    label: "Digits",
    contracts: [
      { value: "DIGITOVER", label: "Over", requiresBarrier: true, barrierType: "digit" },
      { value: "DIGITUNDER", label: "Under", requiresBarrier: true, barrierType: "digit" },
      { value: "DIGITEVEN", label: "Even", requiresBarrier: false },
      { value: "DIGITODD", label: "Odd", requiresBarrier: false },
      { value: "DIGITMATCH", label: "Matches", requiresBarrier: true, barrierType: "digit" },
      { value: "DIGITDIFF", label: "Differs", requiresBarrier: true, barrierType: "digit" },
    ],
  },
  RISE_FALL: {
    label: "Rise/Fall",
    contracts: [
      { value: "CALL", label: "Rise", requiresBarrier: false },
      { value: "PUT", label: "Fall", requiresBarrier: false },
    ],
  },
  HIGHER_LOWER: {
    label: "Higher/Lower",
    contracts: [
      { value: "CALLE", label: "Higher", requiresBarrier: true, barrierType: "price" },
      { value: "PUTE", label: "Lower", requiresBarrier: true, barrierType: "price" },
    ],
  },
  TOUCH_NO_TOUCH: {
    label: "Touch/No Touch",
    contracts: [
      { value: "ONETOUCH", label: "Touch", requiresBarrier: true, barrierType: "price" },
      { value: "NOTOUCH", label: "No Touch", requiresBarrier: true, barrierType: "price" },
    ],
  },
  ENDS_BETWEEN: {
    label: "Ends In/Out",
    contracts: [
      { value: "EXPIRYMISS", label: "Ends Outside", requiresBarrier: true, barrierType: "range" },
      { value: "EXPIRYRANGE", label: "Ends Between", requiresBarrier: true, barrierType: "range" },
    ],
  },
  STAYS_BETWEEN: {
    label: "Stays In/Goes Out",
    contracts: [
      { value: "RANGE", label: "Stays Between", requiresBarrier: true, barrierType: "range" },
      { value: "UPORDOWN", label: "Goes Outside", requiresBarrier: true, barrierType: "range" },
    ],
  },
  ACCUMULATORS: {
    label: "Accumulators",
    contracts: [{ value: "ACCU", label: "Accumulator", requiresBarrier: false }],
  },
  MULTIPLIERS: {
    label: "Multipliers",
    contracts: [
      { value: "MULTUP", label: "Up", requiresBarrier: false },
      { value: "MULTDOWN", label: "Down", requiresBarrier: false },
    ],
  },
  RESET: {
    label: "Reset Call/Put",
    contracts: [
      { value: "RESETCALL", label: "Reset Call", requiresBarrier: false },
      { value: "RESETPUT", label: "Reset Put", requiresBarrier: false },
    ],
  },
  HIGHLOW_TICKS: {
    label: "High/Low Ticks",
    contracts: [
      { value: "TICKHIGH", label: "High Tick", requiresBarrier: false },
      { value: "TICKLOW", label: "Low Tick", requiresBarrier: false },
    ],
  },
  ONLY_UPS_DOWNS: {
    label: "Only Ups/Downs",
    contracts: [
      { value: "RUNS", label: "Only Ups", requiresBarrier: false },
      { value: "RUNHIGH", label: "Only Downs", requiresBarrier: false },
    ],
  },
  ASIANS: {
    label: "Asians",
    contracts: [
      { value: "ASIANU", label: "Asian Up", requiresBarrier: false },
      { value: "ASIAND", label: "Asian Down", requiresBarrier: false },
    ],
  },
}

export function ManualTrader({
  apiClient,
  isAuthorized,
  balance,
  currency,
  theme,
  activeSymbols,
  contractsCache,
  journal,
  selectedSymbol: propSelectedSymbol,
}: ManualTraderProps) {
  const [market, setMarket] = useState(propSelectedSymbol || "1HZ100V")

  const [tradeType, setTradeType] = useState<keyof typeof TRADE_TYPES>("DIGITS")
  const [contractType, setContractType] = useState("DIGITOVER")
  const [barrier, setBarrier] = useState("5")
  const [barrier2, setBarrier2] = useState("") // For range contracts
  const [stake, setStake] = useState(0.35)
  const [duration, setDuration] = useState(1)
  const [durationUnit, setDurationUnit] = useState<"t" | "s" | "m" | "h" | "d">("t")
  const [martingale, setMartingale] = useState(2.1)
  const [sl, setSL] = useState(50)
  const [tp, setTP] = useState(100)
  const [isExecuting, setIsExecuting] = useState(false)
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
          contractType,
          market,
          strategy: "Manual",
        })
      }
    },
    [journal, stake, contractType, market],
  )

  const currentContract = useMemo(() => {
    return TRADE_TYPES[tradeType]?.contracts.find((c) => c.value === contractType)
  }, [tradeType, contractType])

  const requiresBarrier = currentContract?.requiresBarrier || false
  const barrierType = currentContract?.barrierType
  const isRangeContract = barrierType === "range"

  useEffect(() => {
    const contracts = TRADE_TYPES[tradeType]?.contracts
    if (contracts && contracts.length > 0) {
      setContractType(contracts[0].value)
      setBarrier("5")
      setBarrier2("")
    }
  }, [tradeType])

  const executeTrade = useCallback(async () => {
    if (!apiClient || !isAuthorized) {
      logJournal("API not ready or not authorized", "error")
      return
    }

    try {
      setIsExecuting(true)
      logJournal(`Executing ${tradeType} - ${contractType} on ${market}`, "info")

      const tradeExecutor = new TradeExecutor(apiClient)

      const tradeConfig: any = {
        symbol: market,
        contractType,
        stake: Number(stake.toFixed(2)),
        duration,
        durationUnit,
        currency,
      }

      if (requiresBarrier) {
        if (isRangeContract && barrier2) {
          tradeConfig.barrier = barrier
          tradeConfig.barrier2 = barrier2
        } else if (barrierType === "digit") {
          tradeConfig.barrier = barrier
        } else if (barrierType === "price") {
          tradeConfig.barrier = `+${barrier}`
        } else {
          tradeConfig.barrier = barrier
        }
      }

      console.log("[v0] Executing trade with config:", tradeConfig)

      const result = await tradeExecutor.executeTrade(tradeConfig)

      console.log("[v0] Trade result:", result)

      setStats((prev) => {
        const newStats = { ...prev }
        newStats.numberOfRuns++
        newStats.totalStake += stake
        newStats.totalPayout += result.payout

        if (result.isWin) {
          newStats.totalWins++
          newStats.contractsWon++
        } else {
          newStats.totalLosses++
          newStats.contractsLost++
        }

        newStats.totalProfit += result.totalProfit
        newStats.winRate = (newStats.totalWins / newStats.numberOfRuns) * 100

        if (newStats.totalProfit >= tp) {
          logJournal("Take Profit reached!", "success")
          setTPSLModal({
            isOpen: true,
            type: "tp",
            amount: newStats.totalProfit,
          })
        } else if (newStats.totalProfit <= -sl) {
          logJournal("Stop Loss reached!", "error")
          setTPSLModal({
            isOpen: true,
            type: "sl",
            amount: Math.abs(newStats.totalProfit),
          })
        }

        return newStats
      })

      const tradeRecord: TradeRecord = {
        id: result.contractId.toString(),
        contractType,
        market,
        entry: new Date().toLocaleTimeString(),
        stake,
        pl: result.totalProfit,
        payout: result.payout,
        timestamp: result.timestamp,
        entrySpot: result.entrySpot?.toString(),
        exitSpot: result.exitSpot?.toString(),
      }

      setTradeHistory((prev) => [tradeRecord, ...prev])

      logJournal(
        `Contract #${result.contractId} ${result.isWin ? "WON" : "LOST"}: ${result.totalProfit >= 0 ? "+" : ""}${result.totalProfit.toFixed(2)} ${currency}`,
        result.isWin ? "success" : "error",
      )

      if (journal) {
        journal.addEntry({
          type: "TRADE",
          action: result.isWin ? "WIN" : "LOSS",
          stake,
          profit: result.totalProfit,
          contractType,
          market,
          strategy: "Manual",
        })
      }
    } catch (error: any) {
      console.error("[v0] Trade execution failed:", error)
      logJournal(`Trade execution failed: ${error.message}`, "error")
    } finally {
      setIsExecuting(false)
    }
  }, [
    apiClient,
    isAuthorized,
    market,
    tradeType,
    contractType,
    stake,
    duration,
    durationUnit,
    currency,
    barrier,
    barrier2,
    requiresBarrier,
    isRangeContract,
    barrierType,
    tp,
    sl,
    logJournal,
    journal,
  ])

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
          Trade Configuration
        </h3>

        <div className="space-y-3">
          <div>
            <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
              Trade Type
            </Label>
            <Select value={tradeType} onValueChange={(val) => setTradeType(val as keyof typeof TRADE_TYPES)}>
              <SelectTrigger
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={theme === "dark" ? "bg-[#0a0e27] border-blue-500/30" : "bg-white"}>
                {Object.entries(TRADE_TYPES).map(([key, { label }]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
              Contract Type
            </Label>
            <Select value={contractType} onValueChange={setContractType}>
              <SelectTrigger
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={theme === "dark" ? "bg-[#0a0e27] border-blue-500/30" : "bg-white"}>
                {TRADE_TYPES[tradeType]?.contracts.map((contract) => (
                  <SelectItem key={contract.value} value={contract.value} className="text-xs">
                    {contract.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {requiresBarrier && !isRangeContract && (
              <div>
                <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  {barrierType === "digit" ? "Prediction (0-9)" : "Barrier"}
                </Label>
                <Input
                  type={barrierType === "digit" ? "number" : "text"}
                  min={barrierType === "digit" ? "0" : undefined}
                  max={barrierType === "digit" ? "9" : undefined}
                  value={barrier}
                  onChange={(e) => setBarrier(e.target.value)}
                  className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                />
              </div>
            )}

            {requiresBarrier && isRangeContract && (
              <>
                <div>
                  <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                    High Barrier
                  </Label>
                  <Input
                    type="text"
                    value={barrier}
                    onChange={(e) => setBarrier(e.target.value)}
                    placeholder="+0.5"
                    className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  />
                </div>
                <div>
                  <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                    Low Barrier
                  </Label>
                  <Input
                    type="text"
                    value={barrier2}
                    onChange={(e) => setBarrier2(e.target.value)}
                    placeholder="-0.5"
                    className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  />
                </div>
              </>
            )}

            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Stake ($)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={stake}
                onChange={(e) => setStake(Number.parseFloat(e.target.value))}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>

            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Duration
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number.parseInt(e.target.value))}
                  className={`text-xs h-9 flex-1 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                />
                <Select value={durationUnit} onValueChange={(val: any) => setDurationUnit(val)}>
                  <SelectTrigger
                    className={`text-xs h-9 w-16 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={theme === "dark" ? "bg-[#0a0e27] border-blue-500/30" : "bg-white"}>
                    <SelectItem value="t" className="text-xs">
                      Ticks
                    </SelectItem>
                    <SelectItem value="s" className="text-xs">
                      Sec
                    </SelectItem>
                    <SelectItem value="m" className="text-xs">
                      Min
                    </SelectItem>
                    <SelectItem value="h" className="text-xs">
                      Hour
                    </SelectItem>
                    <SelectItem value="d" className="text-xs">
                      Day
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-blue-500/30 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              />
            </div>
          </div>
        </div>
      </div>

      <Button
        onClick={executeTrade}
        disabled={!isAuthorized || isExecuting}
        className="w-full h-11 text-sm font-bold bg-blue-500 hover:bg-blue-600"
      >
        {isExecuting ? "Executing..." : "Execute Trade"}
      </Button>

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
            <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Session Status: Ready</p>
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
