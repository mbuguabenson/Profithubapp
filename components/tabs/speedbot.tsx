"use client"
import { useState, useCallback, useRef, useEffect } from "react"
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
import { Square, Zap } from "lucide-react"

interface SpeedBotProps {
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

export function SpeedBot({
  apiClient,
  isAuthorized,
  balance,
  currency,
  theme,
  activeSymbols,
  contractsCache,
  journal,
  selectedSymbol: propSelectedSymbol,
}: SpeedBotProps) {
  const [market, setMarket] = useState(propSelectedSymbol || "1HZ100V")
  const [tradeType, setTradeType] = useState("digits")
  const [contractType, setContractType] = useState("DIGITEVEN")
  const [stake, setStake] = useState(0.35)
  const [martingale, setMartingale] = useState(2.1)
  const [sl, setSL] = useState(50)
  const [tp, setTP] = useState(100)
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

  const currentStakeRef = useRef(stake)
  const isRunningRef = useRef(false)
  const tickSubscriptionRef = useRef<string | null>(null)
  const lastTickTimeRef = useRef<number>(0)
  const tickCountRef = useRef<number>(0)
  const tradeQueueRef = useRef<Array<{ tickId: number; price: number }>>([])
  const processingRef = useRef(false)
  const pendingTradeRef = useRef(false)
  const failedTradesRef = useRef(0)
  const maxFailedTradesRef = useRef(3)
  const processedTicksRef = useRef(new Set<string>())

  const logJournal = useCallback(
    (message: string, type: "info" | "success" | "error" | "warn" = "info") => {
      const time = new Date().toLocaleTimeString()
      setJournalLog((prev) => [{ time, message, type }, ...prev].slice(0, 200))

      if (journal) {
        journal.addEntry({
          type: "TRADE",
          action: type === "success" ? "WIN" : type === "error" ? "LOSS" : "INFO",
          stake: currentStakeRef.current,
          profit: 0,
          contractType,
          market,
          strategy: "SpeedBot",
        })
      }
    },
    [journal, contractType, market],
  )

  const getAvailableTradeTypes = useCallback(
    (m: string) => {
      const contracts = contractsCache[m]
      if (!contracts) return []
      return Object.keys(contracts).sort()
    },
    [contractsCache],
  )

  const getAvailableContractTypes = useCallback(
    (m: string, tt: string) => {
      const contracts = contractsCache[m]?.[tt]
      if (!contracts) return []
      return contracts.map((ct: any) => ({
        value: ct.contract_type,
        label: ct.contract_display || ct.contract_type,
      }))
    },
    [contractsCache],
  )

  const shouldShowPrediction = ["DIGITUNDER", "DIGITOVER", "DIGITMATCH", "DIGITDIFF"].includes(contractType)

  const executeSpeedTrade = useCallback(async () => {
    if (!apiClient || !isAuthorized) {
      logJournal("API not ready", "error")
      return
    }

    if (pendingTradeRef.current) {
      logJournal("Trade already pending - skipping duplicate", "warn")
      return
    }

    try {
      pendingTradeRef.current = true
      setBotStatus("Executing trade...")
      logJournal(`SpeedBot executing on ${market}`, "info")

      const tradeExecutor = new TradeExecutor(apiClient)
      const tradeConfig = {
        symbol: market,
        contractType,
        stake: Number(currentStakeRef.current.toFixed(2)),
        duration: 1,
        durationUnit: "t",
        currency,
      }

      const result = await tradeExecutor.executeTrade(tradeConfig)

      if (!result) {
        logJournal("Null trade result received - skipping", "warn")
        failedTradesRef.current++
        if (failedTradesRef.current >= maxFailedTradesRef.current) {
          logJournal(`Max failed trades (${maxFailedTradesRef.current}) reached - stopping bot`, "error")
          setIsRunning(false)
          isRunningRef.current = false
        }
        setBotStatus("Idle")
        return
      }

      if (!result.contractId || result.contractId <= 0) {
        logJournal("Invalid contract ID in result - skipping", "warn")
        failedTradesRef.current++
        if (failedTradesRef.current >= maxFailedTradesRef.current) {
          logJournal(`Max failed trades (${maxFailedTradesRef.current}) reached - stopping bot`, "error")
          setIsRunning(false)
          isRunningRef.current = false
        }
        setBotStatus("Idle")
        return
      }

      if (result.payout <= 0 || !isFinite(result.payout)) {
        logJournal("Invalid payout in result - skipping", "warn")
        failedTradesRef.current++
        if (failedTradesRef.current >= maxFailedTradesRef.current) {
          logJournal(`Max failed trades (${maxFailedTradesRef.current}) reached - stopping bot`, "error")
          setIsRunning(false)
          isRunningRef.current = false
        }
        setBotStatus("Idle")
        return
      }

      failedTradesRef.current = 0

      setStats((prev) => {
        const newStats = { ...prev }
        newStats.numberOfRuns++
        newStats.totalStake += currentStakeRef.current
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
          logJournal("SpeedBot TP reached!", "success")
          setTPSLModal({
            isOpen: true,
            type: "tp",
            amount: newStats.totalProfit,
          })
          setIsRunning(false)
          isRunningRef.current = false
        } else if (newStats.totalProfit <= -sl) {
          logJournal("SpeedBot SL reached!", "error")
          setTPSLModal({
            isOpen: true,
            type: "sl",
            amount: Math.abs(newStats.totalProfit),
          })
          setIsRunning(false)
          isRunningRef.current = false
        }

        return newStats
      })

      setBotStatus("Idle")

      const tradeRecord: TradeRecord = {
        id: result.contractId.toString(),
        contractType,
        market,
        entry: new Date().toLocaleTimeString(),
        stake: currentStakeRef.current,
        pl: result.totalProfit,
        payout: result.payout,
        timestamp: result.timestamp,
        entrySpot: result.entrySpot?.toString(),
        exitSpot: result.exitSpot?.toString(),
      }

      setTradeHistory((prev) => [tradeRecord, ...prev])

      if (journal) {
        journal.addEntry({
          type: "TRADE",
          action: result.isWin ? "WIN" : "LOSS",
          stake: currentStakeRef.current,
          profit: result.totalProfit,
          contractType,
          market,
          strategy: "SpeedBot",
        })
      }

      logJournal(
        `SpeedBot ${result.isWin ? "WON" : "LOST"}: ${result.totalProfit >= 0 ? "+" : ""}${result.totalProfit.toFixed(2)} ${currency}`,
        result.isWin ? "success" : "error",
      )

      if (result.totalProfit > 0) {
        currentStakeRef.current = stake
      } else {
        currentStakeRef.current *= martingale
      }
    } catch (error: any) {
      logJournal(`SpeedBot error: ${error.message}`, "error")
      failedTradesRef.current++
      if (failedTradesRef.current >= maxFailedTradesRef.current) {
        logJournal(`Max failed trades (${maxFailedTradesRef.current}) reached - stopping bot`, "error")
        setIsRunning(false)
        isRunningRef.current = false
      }
      setBotStatus("Idle")
    } finally {
      pendingTradeRef.current = false
    }
  }, [apiClient, isAuthorized, market, contractType, currency, stake, martingale, tp, sl, logJournal, journal])

  const processTradeQueue = useCallback(async () => {
    if (processingRef.current || tradeQueueRef.current.length === 0 || !isRunningRef.current) {
      return
    }

    processingRef.current = true
    const tradeData = tradeQueueRef.current.shift()

    if (!tradeData) {
      processingRef.current = false
      return
    }

    const tickKey = `${tradeData.tickId}-${tradeData.price}`
    if (processedTicksRef.current.has(tickKey)) {
      logJournal(`Tick ${tradeData.tickId} already processed - skipping duplicate`, "warn")
      processingRef.current = false
      return
    }
    processedTicksRef.current.add(tickKey)

    if (!tradeData.price || !isFinite(tradeData.price) || tradeData.price <= 0) {
      logJournal(`Tick ${tradeData.tickId}: Invalid price ${tradeData.price} - skipping`, "warn")
      processingRef.current = false
      return
    }

    const lastDigit = Math.floor((tradeData.price * 100) % 10)
    if (lastDigit === null || lastDigit === undefined || lastDigit < 0 || lastDigit > 9) {
      logJournal(`Tick ${tradeData.tickId}: Invalid digit ${lastDigit} - skipping`, "warn")
      processingRef.current = false
      return
    }

    try {
      setBotStatus(`Executing tick ${tradeData.tickId}...`)
      logJournal(`SpeedBot executing tick ${tradeData.tickId} at ${tradeData.price} (digit: ${lastDigit})`, "info")

      const tradeExecutor = new TradeExecutor(apiClient)
      const tradeConfig = {
        symbol: market,
        contractType,
        stake: Number(currentStakeRef.current.toFixed(2)),
        duration: 1,
        durationUnit: "t",
        currency,
      }

      const result = await tradeExecutor.executeTrade(tradeConfig)

      if (!result || !result.contractId || result.contractId <= 0) {
        logJournal(`Tick ${tradeData.tickId}: Invalid result - retrying`, "warn")
        processingRef.current = false
        return
      }

      const actualPayout = result.sell_price || result.payout || 0
      const profit = actualPayout - currentStakeRef.current

      setStats((prev) => {
        const newStats = { ...prev }
        newStats.numberOfRuns++
        newStats.totalStake += currentStakeRef.current
        newStats.totalPayout += actualPayout

        if (result.isWin || profit > 0) {
          newStats.totalWins++
          newStats.contractsWon++
        } else {
          newStats.totalLosses++
          newStats.contractsLost++
        }

        newStats.totalProfit += profit
        newStats.winRate = (newStats.totalWins / newStats.numberOfRuns) * 100

        if (newStats.totalProfit >= tp) {
          logJournal("SpeedBot TP reached!", "success")
          setTPSLModal({
            isOpen: true,
            type: "tp",
            amount: newStats.totalProfit,
          })
          setIsRunning(false)
          isRunningRef.current = false
        } else if (newStats.totalProfit <= -sl) {
          logJournal("SpeedBot SL reached!", "error")
          setTPSLModal({
            isOpen: true,
            type: "sl",
            amount: Math.abs(newStats.totalProfit),
          })
          setIsRunning(false)
          isRunningRef.current = false
        }

        return newStats
      })

      setBotStatus("Processing queue")

      const tradeRecord: TradeRecord = {
        id: result.contractId.toString(),
        contractType,
        market,
        entry: new Date().toLocaleTimeString(),
        stake: currentStakeRef.current,
        pl: profit,
        payout: actualPayout,
        timestamp: result.timestamp,
        entrySpot: result.entrySpot?.toString(),
        exitSpot: result.exitSpot?.toString(),
      }

      setTradeHistory((prev) => [tradeRecord, ...prev])

      if (journal) {
        journal.addEntry({
          type: "TRADE",
          action: result.isWin ? "WIN" : "LOSS",
          stake: currentStakeRef.current,
          profit: profit,
          contractType,
          market,
          strategy: "SpeedBot",
        })
      }

      logJournal(
        `Tick ${tradeData.tickId}: ${result.isWin ? "WON" : "LOST"} ${profit >= 0 ? "+" : ""}${profit.toFixed(2)} ${currency} (Payout: ${actualPayout.toFixed(2)})`,
        result.isWin ? "success" : "error",
      )

      if (profit > 0) {
        currentStakeRef.current = stake
      } else {
        currentStakeRef.current *= martingale
      }
    } catch (error: any) {
      logJournal(`Tick ${tradeData.tickId} error: ${error.message}`, "error")
    } finally {
      processingRef.current = false
      if (isRunningRef.current && tradeQueueRef.current.length > 0) {
        setTimeout(() => processTradeQueue(), 100)
      }
    }
  }, [apiClient, isAuthorized, market, contractType, currency, stake, martingale, tp, sl, logJournal, journal])

  useEffect(() => {
    if (!isRunning || !apiClient) return

    isRunningRef.current = true
    processedTicksRef.current.clear()
    logJournal("SpeedBot started - NO TICK SKIPPING MODE", "info")

    const subscribeToTicks = async () => {
      try {
        tickSubscriptionRef.current = await apiClient.subscribeTicks(market, async (tick: any) => {
          if (!isRunningRef.current) return

          tickCountRef.current++

          if (!tick || tick.quote === undefined || tick.quote === null || !isFinite(tick.quote) || tick.quote <= 0) {
            logJournal(`Invalid tick ${tickCountRef.current} (quote: ${tick?.quote}) - skipping`, "warn")
            return
          }

          const lastDigit = Math.floor((tick.quote * 100) % 10)
          if (lastDigit === null || lastDigit === undefined || lastDigit < 0 || lastDigit > 9) {
            logJournal(`Tick ${tickCountRef.current}: Invalid digit ${lastDigit} - skipping`, "warn")
            return
          }

          tradeQueueRef.current.push({
            tickId: tickCountRef.current,
            price: tick.quote,
          })

          logJournal(
            `Tick ${tickCountRef.current} queued - Price: ${tick.quote.toFixed(5)} (Digit: ${lastDigit}) | Queue: ${tradeQueueRef.current.length}`,
            "info",
          )

          if (!processingRef.current) {
            processTradeQueue()
          }
        })
      } catch (error: any) {
        if (error.message?.includes("already subscribed")) {
          logJournal(`Already subscribed to ${market} - reusing existing subscription`, "warn")
        } else {
          logJournal(`Tick subscription error: ${error.message}`, "error")
          setIsRunning(false)
          isRunningRef.current = false
        }
      }
    }

    subscribeToTicks()

    return () => {
      isRunningRef.current = false
      processedTicksRef.current.clear()
      if (tickSubscriptionRef.current && apiClient) {
        try {
          apiClient.forget(tickSubscriptionRef.current).catch(() => {})
        } catch (e) {}
      }
      tradeQueueRef.current = []
    }
  }, [isRunning, apiClient, market, logJournal, processTradeQueue])

  const tradeTypes = getAvailableTradeTypes(market)
  const contractTypes = getAvailableContractTypes(market, tradeType)

  return (
    <div className="space-y-4">
      <TPSLModal
        isOpen={tpslModal.isOpen}
        type={tpslModal.type}
        amount={tpslModal.amount}
        currency={currency}
        onClose={() => setTPSLModal({ ...tpslModal, isOpen: false })}
      />

      {isRunning && (
        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400 animate-pulse" />
            <p className="text-xs text-purple-400 font-bold">
              SpeedBot Active: Trading on EVERY tick - Queue: {tradeQueueRef.current.length} pending
            </p>
          </div>
        </div>
      )}

      <div
        className={`p-4 rounded-lg border ${theme === "dark" ? "bg-[#0a0e27]/50 border-purple-500/20" : "bg-purple-50 border-purple-200"}`}
      >
        <h3 className={`text-sm font-bold mb-4 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          SpeedBot Configuration - Every Tick Execution
        </h3>

        <div className="space-y-3">
          {tradeTypes.length > 0 && (
            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Trade Type
              </Label>
              <Select value={tradeType} onValueChange={setTradeType} disabled={isRunning}>
                <SelectTrigger
                  className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-purple-500/30 text-white" : "bg-white border-purple-300 text-gray-900"}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={theme === "dark" ? "bg-[#0a0e27] border-purple-500/30" : "bg-white"}>
                  {tradeTypes.map((tt) => (
                    <SelectItem key={tt} value={tt} className="text-xs">
                      {tt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {contractTypes.length > 0 && (
            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Contract Type
              </Label>
              <Select value={contractType} onValueChange={setContractType} disabled={isRunning}>
                <SelectTrigger
                  className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-purple-500/30 text-white" : "bg-white border-purple-300 text-gray-900"}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={theme === "dark" ? "bg-[#0a0e27] border-purple-500/30" : "bg-white"}>
                  {contractTypes.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value} className="text-xs">
                      {ct.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className={`text-xs mb-1.5 block ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Stake ($)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={stake}
                onChange={(e) => {
                  const val = Number.parseFloat(e.target.value)
                  setStake(val)
                  currentStakeRef.current = val
                }}
                disabled={isRunning}
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-purple-500/30 text-white" : "bg-white border-purple-300 text-gray-900"}`}
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
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-purple-500/30 text-white" : "bg-white border-purple-300 text-gray-900"}`}
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
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-purple-500/30 text-white" : "bg-white border-purple-300 text-gray-900"}`}
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
                className={`text-xs h-9 ${theme === "dark" ? "bg-[#0f1629] border-purple-500/30 text-white" : "bg-white border-purple-300 text-gray-900"}`}
              />
            </div>
          </div>
        </div>
      </div>

      <Button
        onClick={() => setIsRunning(!isRunning)}
        disabled={!isAuthorized}
        className={`w-full h-11 text-sm font-bold ${isRunning ? "bg-red-500 hover:bg-red-600" : "bg-purple-500 hover:bg-purple-600"}`}
      >
        {isRunning ? (
          <>
            <Square className="w-4 h-4 mr-2" />
            Stop SpeedBot
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 mr-2" />
            Start SpeedBot
          </>
        )}
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
          tickCountRef.current = 0
          tradeQueueRef.current = []
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
            className={`p-4 rounded-lg border ${theme === "dark" ? "bg-[#0a0e27]/50 border-purple-500/20" : "bg-purple-50 border-purple-200"}`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${botStatus === "Idle" ? "text-green-400" : "text-yellow-400"}`}>
                  Status: {botStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Ticks Received: {tickCountRef.current}
                </span>
                <span className={`text-xs ${theme === "dark" ? "text-purple-400" : "text-purple-600"}`}>
                  Queue Length: {tradeQueueRef.current.length}
                </span>
              </div>
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
