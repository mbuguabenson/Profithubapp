import { DerivWebSocket } from "@/lib/deriv-websocket"

export interface StrategyConfig {
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

export interface StrategyStats {
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

export interface TradeLog {
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
  strategyId: string
}

export interface Tick {
  epoch: number
  quote: number
  digit: number
  symbol: string
}

export class StrategyManager {
  private strategies: Map<string, StrategyConfig> = new Map()
  private stats: Map<string, StrategyStats> = new Map()
  private trades: Map<string, TradeLog[]> = new Map()
  private ticks: Map<string, Tick[]> = new Map()
  private websockets: Map<string, DerivWebSocket> = new Map()
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private currentStakes: Map<string, number> = new Map()
  private sessionProfits: Map<string, number> = new Map()
  private consecutiveErrors: Map<string, number> = new Map()

  constructor() {
    console.log("[v0] StrategyManager initialized")
  }

  registerStrategy(config: StrategyConfig): void {
    this.strategies.set(config.id, config)
    this.stats.set(config.id, this.createEmptyStats())
    this.trades.set(config.id, [])
    this.ticks.set(config.id, [])
    this.currentStakes.set(config.id, config.stake)
    this.sessionProfits.set(config.id, 0)
    this.consecutiveErrors.set(config.id, 0)
    console.log(`[v0] Strategy registered: ${config.id} (${config.type})`)
  }

  updateStrategy(id: string, updates: Partial<StrategyConfig>): void {
    const current = this.strategies.get(id)
    if (!current) return
    this.strategies.set(id, { ...current, ...updates })
    console.log(`[v0] Strategy updated: ${id}`, updates)
  }

  async startStrategy(id: string, apiToken: string): Promise<void> {
    const config = this.strategies.get(id)
    if (!config || !config.enabled) {
      console.error(`[v0] Cannot start strategy ${id}: not found or disabled`)
      return
    }

    try {
      this.updateStrategy(id, { state: "analysing" })
      console.log(`[v0] Starting strategy ${id} on ${config.marketSymbol}`)

      // Initialize WebSocket connection
      const ws = new DerivWebSocket(apiToken)
      await ws.connect()
      this.websockets.set(id, ws)

      // Subscribe to ticks
      await ws.subscribeTicks(config.marketSymbol, (tick) => {
        this.handleTick(id, tick)
      })

      // Start analysis loop
      const interval = setInterval(() => {
        this.runAnalysis(id)
      }, 1000) // Analyze every second
      this.intervals.set(id, interval)

      console.log(`[v0] Strategy ${id} started successfully`)
    } catch (error) {
      console.error(`[v0] Error starting strategy ${id}:`, error)
      this.handleError(id, error)
    }
  }

  async stopStrategy(id: string): Promise<void> {
    console.log(`[v0] Stopping strategy ${id}`)

    const interval = this.intervals.get(id)
    if (interval) {
      clearInterval(interval)
      this.intervals.delete(id)
    }

    const ws = this.websockets.get(id)
    if (ws) {
      await ws.disconnect()
      this.websockets.delete(id)
    }

    this.updateStrategy(id, { state: "idle" })
    console.log(`[v0] Strategy ${id} stopped`)
  }

  private handleTick(strategyId: string, tick: any): void {
    const tickData: Tick = {
      epoch: tick.epoch,
      quote: tick.quote,
      digit: this.extractLastDigit(tick.quote),
      symbol: tick.symbol,
    }

    const ticks = this.ticks.get(strategyId) || []
    ticks.push(tickData)

    // Keep only rolling window of ticks
    const config = this.strategies.get(strategyId)
    if (config) {
      const maxTicks = config.analysisMinutes * 60 // Assuming 1 tick per second
      if (ticks.length > maxTicks) {
        ticks.shift()
      }
    }

    this.ticks.set(strategyId, ticks)
  }

  private extractLastDigit(quote: number): number {
    return Number.parseInt(String(quote).slice(-1))
  }

  private runAnalysis(strategyId: string): void {
    const config = this.strategies.get(strategyId)
    const ticks = this.ticks.get(strategyId) || []

    if (!config || ticks.length === 0) return

    // Calculate statistics
    const stats = this.calculateStats(ticks)
    this.stats.set(strategyId, stats)

    // Check trading conditions based on strategy type
    if (config.state === "analysing") {
      const shouldTrade = this.evaluateStrategy(config, stats, ticks)
      if (shouldTrade) {
        this.executeTrade(strategyId, stats)
      }
    }
  }

  private calculateStats(ticks: Tick[]): StrategyStats {
    const digitFrequencies: Record<number, number> = {}
    let evenCount = 0
    let oddCount = 0
    let overCount = 0
    let underCount = 0

    for (let i = 0; i <= 9; i++) {
      digitFrequencies[i] = 0
    }

    ticks.forEach((tick) => {
      digitFrequencies[tick.digit]++
      if (tick.digit % 2 === 0) evenCount++
      else oddCount++
      if (tick.digit >= 5) overCount++
      else underCount++
    })

    const total = ticks.length
    const evenPercent = (evenCount / total) * 100
    const oddPercent = (oddCount / total) * 100
    const overPercent = (overCount / total) * 100
    const underPercent = (underCount / total) * 100

    // Calculate power (max frequency)
    const maxFreq = Math.max(...Object.values(digitFrequencies))
    const power = (maxFreq / total) * 100

    // Determine decision state
    let decisionState: "WAIT" | "TRADE_NOW" | "STRONG" | "TRADING" = "WAIT"
    if (power >= 60) decisionState = "STRONG"
    else if (power >= 55) decisionState = "TRADE_NOW"
    else if (power >= 50) decisionState = "WAIT"

    // Calculate momentum
    const recentTicks = ticks.slice(-10)
    const olderTicks = ticks.slice(-20, -10)
    const recentPower =
      recentTicks.length > 0
        ? (Math.max(...Object.values(this.getFrequencies(recentTicks))) / recentTicks.length) * 100
        : 0
    const olderPower =
      olderTicks.length > 0
        ? (Math.max(...Object.values(this.getFrequencies(olderTicks))) / olderTicks.length) * 100
        : 0
    const momentum: "rising" | "falling" | "stable" =
      recentPower > olderPower + 2 ? "rising" : recentPower < olderPower - 2 ? "falling" : "stable"

    return {
      sampleSize: total,
      digitFrequencies,
      overPercent,
      underPercent,
      evenPercent,
      oddPercent,
      decisionState,
      lastDigits: ticks.slice(-20).map((t) => t.digit),
      momentum,
      power,
    }
  }

  private getFrequencies(ticks: Tick[]): Record<number, number> {
    const freq: Record<number, number> = {}
    for (let i = 0; i <= 9; i++) freq[i] = 0
    ticks.forEach((t) => freq[t.digit]++)
    return freq
  }

  private evaluateStrategy(config: StrategyConfig, stats: StrategyStats, ticks: Tick[]): boolean {
    switch (config.type) {
      case "DIFFERS":
        return this.evaluateDiffers(stats, ticks)
      case "OVER3_UNDER6":
        return this.evaluateOver3Under6(stats)
      case "OVER2_UNDER7":
        return this.evaluateOver2Under7(stats)
      case "OVER1_UNDER8":
        return this.evaluateOver1Under8(stats)
      case "EVEN_ODD":
        return this.evaluateEvenOdd(stats)
      default:
        return false
    }
  }

  private evaluateDiffers(stats: StrategyStats, ticks: Tick[]): boolean {
    // Target digits 2-7 with <10% frequency
    const targetDigits = [2, 3, 4, 5, 6, 7]
    const lowFreqDigits = targetDigits.filter((d) => {
      const freq = stats.digitFrequencies[d]
      const percent = (freq / stats.sampleSize) * 100
      return percent < 10
    })

    if (lowFreqDigits.length === 0) return false

    // Check for 3 consecutive absences of target digit
    const lastThree = stats.lastDigits.slice(-3)
    const targetDigit = lowFreqDigits[0]
    return lastThree.every((d) => d !== targetDigit)
  }

  private evaluateOver3Under6(stats: StrategyStats): boolean {
    // Over3 (4-9) >= 55% with rising momentum
    const over3Percent = this.calculateOverPercent(stats, 3)
    return over3Percent >= 55 && stats.momentum === "rising"
  }

  private evaluateOver2Under7(stats: StrategyStats): boolean {
    // Over2 (3-9) or Under7 (0-6) based on prediction
    const over2Percent = this.calculateOverPercent(stats, 2)
    return over2Percent >= 55 && stats.momentum === "rising"
  }

  private evaluateOver1Under8(stats: StrategyStats): boolean {
    // Advanced power dynamics
    return stats.power >= 58 && stats.momentum === "rising"
  }

  private evaluateEvenOdd(stats: StrategyStats): boolean {
    // Even or Odd >= 56% with momentum
    return (stats.evenPercent >= 56 || stats.oddPercent >= 56) && stats.momentum === "rising"
  }

  private calculateOverPercent(stats: StrategyStats, barrier: number): number {
    let count = 0
    for (let digit = barrier + 1; digit <= 9; digit++) {
      count += stats.digitFrequencies[digit] || 0
    }
    return (count / stats.sampleSize) * 100
  }

  private async executeTrade(strategyId: string, stats: StrategyStats): Promise<void> {
    const config = this.strategies.get(strategyId)
    if (!config) return

    this.updateStrategy(strategyId, { state: "trading" })

    try {
      const ws = this.websockets.get(strategyId)
      if (!ws) throw new Error("WebSocket not connected")

      const currentStake = this.currentStakes.get(strategyId) || config.stake
      const contractType = this.getContractType(config.type, stats)
      const barrier = this.getBarrier(config.type, stats)

      // Request proposal
      const proposal = await ws.proposal({
        amount: currentStake,
        basis: "stake",
        contract_type: contractType,
        currency: "USD",
        duration: config.ticksPerTrade,
        duration_unit: "t",
        symbol: config.marketSymbol,
        barrier: barrier,
      })

      if (!proposal || !proposal.proposal) {
        throw new Error("Invalid proposal response")
      }

      // Buy contract
      const buyResult = await ws.buy(proposal.proposal.id, proposal.proposal.ask_price)

      if (!buyResult || !buyResult.buy) {
        throw new Error("Buy failed")
      }

      // Log trade
      const trade: TradeLog = {
        id: `trade-${Date.now()}`,
        timestamp: Date.now(),
        contractId: buyResult.buy.contract_id,
        proposalId: proposal.proposal.id,
        buyPrice: proposal.proposal.ask_price,
        payout: proposal.proposal.payout,
        result: "pending",
        profit: 0,
        entryTick: stats.lastDigits[stats.lastDigits.length - 1],
        strategyId,
      }

      const trades = this.trades.get(strategyId) || []
      trades.push(trade)
      this.trades.set(strategyId, trades)

      // Subscribe to contract updates
      ws.subscribeProposalOpenContract(buyResult.buy.contract_id, (contract) => {
        this.handleContractUpdate(strategyId, trade.id, contract)
      })

      console.log(`[v0] Trade executed for strategy ${strategyId}:`, trade)

      this.updateStrategy(strategyId, { state: "analysing" })
    } catch (error) {
      console.error(`[v0] Trade execution error for strategy ${strategyId}:`, error)
      this.handleError(strategyId, error)
    }
  }

  private getContractType(strategyType: string, stats: StrategyStats): string {
    switch (strategyType) {
      case "DIFFERS":
        return "DIGITDIFF"
      case "OVER3_UNDER6":
        return stats.overPercent > stats.underPercent ? "DIGITOVER" : "DIGITUNDER"
      case "OVER2_UNDER7":
        return stats.overPercent > stats.underPercent ? "DIGITOVER" : "DIGITUNDER"
      case "OVER1_UNDER8":
        return "DIGITOVER"
      case "EVEN_ODD":
        return stats.evenPercent > stats.oddPercent ? "DIGITEVEN" : "DIGITODD"
      default:
        return "DIGITODD"
    }
  }

  private getBarrier(strategyType: string, stats: StrategyStats): string | undefined {
    switch (strategyType) {
      case "OVER3_UNDER6":
        return stats.overPercent > stats.underPercent ? "3" : "6"
      case "OVER2_UNDER7":
        return stats.overPercent > stats.underPercent ? "2" : "7"
      case "OVER1_UNDER8":
        return "1"
      case "DIFFERS":
        // Find the digit with lowest frequency in 2-7 range
        const targetDigits = [2, 3, 4, 5, 6, 7]
        const lowestDigit = targetDigits.reduce((min, d) =>
          stats.digitFrequencies[d] < stats.digitFrequencies[min] ? d : min,
        )
        return String(lowestDigit)
      default:
        return undefined
    }
  }

  private handleContractUpdate(strategyId: string, tradeId: string, contract: any): void {
    const trades = this.trades.get(strategyId) || []
    const trade = trades.find((t) => t.id === tradeId)
    if (!trade) return

    if (contract.status === "won" || contract.status === "lost") {
      const profit = contract.status === "won" ? contract.profit : -trade.buyPrice
      trade.result = contract.status === "won" ? "win" : "loss"
      trade.profit = profit
      trade.exitTick = contract.exit_tick

      // Update session profit
      const sessionProfit = (this.sessionProfits.get(strategyId) || 0) + profit
      this.sessionProfits.set(strategyId, sessionProfit)

      // Handle martingale
      this.handleMartingale(strategyId, trade.result)

      // Check TP/SL
      this.checkTPSL(strategyId, sessionProfit)

      console.log(`[v0] Trade completed for strategy ${strategyId}:`, trade)
    }
  }

  private handleMartingale(strategyId: string, result: "win" | "loss"): void {
    const config = this.strategies.get(strategyId)
    if (!config) return

    const currentStake = this.currentStakes.get(strategyId) || config.stake

    if (result === "loss") {
      // Increase stake
      const newStake = currentStake * config.martingaleMultiplier
      this.currentStakes.set(strategyId, newStake)
      console.log(`[v0] Martingale: increased stake to ${newStake} for strategy ${strategyId}`)
    } else {
      // Reset to base stake
      this.currentStakes.set(strategyId, config.stake)
      console.log(`[v0] Martingale: reset stake to ${config.stake} for strategy ${strategyId}`)
    }
  }

  private checkTPSL(strategyId: string, sessionProfit: number): void {
    const config = this.strategies.get(strategyId)
    if (!config) return

    if (sessionProfit >= config.targetProfit) {
      console.log(`[v0] Target profit reached for strategy ${strategyId}. Stopping.`)
      this.stopStrategy(strategyId)
    } else if (Math.abs(sessionProfit) >= config.stopLoss) {
      console.log(`[v0] Stop loss hit for strategy ${strategyId}. Stopping.`)
      this.stopStrategy(strategyId)
    }
  }

  private handleError(strategyId: string, error: any): void {
    const config = this.strategies.get(strategyId)
    if (!config) return

    const errorCount = (this.consecutiveErrors.get(strategyId) || 0) + 1
    this.consecutiveErrors.set(strategyId, errorCount)

    if (errorCount >= 5) {
      console.error(`[v0] Too many errors for strategy ${strategyId}. Pausing.`)
      this.updateStrategy(strategyId, { state: "error" })
      this.stopStrategy(strategyId)
    } else if (config.autoRestart) {
      console.log(`[v0] Auto-restarting strategy ${strategyId} in ${config.retryDelay}s`)
      setTimeout(() => {
        this.startStrategy(strategyId, "") // Token needs to be passed from context
      }, config.retryDelay * 1000)
    }
  }

  private createEmptyStats(): StrategyStats {
    return {
      sampleSize: 0,
      digitFrequencies: {},
      overPercent: 0,
      underPercent: 0,
      evenPercent: 0,
      oddPercent: 0,
      decisionState: "WAIT",
      lastDigits: [],
      momentum: "stable",
      power: 0,
    }
  }

  getStrategy(id: string): StrategyConfig | undefined {
    return this.strategies.get(id)
  }

  getStats(id: string): StrategyStats | undefined {
    return this.stats.get(id)
  }

  getTrades(id: string): TradeLog[] {
    return this.trades.get(id) || []
  }

  getAllStrategies(): StrategyConfig[] {
    return Array.from(this.strategies.values())
  }
}

// Global singleton instance
export const strategyManager = new StrategyManager()
