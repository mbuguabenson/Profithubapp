"use client"

import { useState, useCallback, useRef } from "react"
import { useGlobalTradingContext } from "@/hooks/use-global-trading-context"
import { DerivAPIClient } from "@/lib/deriv-api"

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

interface Tick {
  epoch: number
  quote: number
  digit: number
  symbol: string
}

export function useStrategyManager() {
  const { apiToken, isAuthorized } = useGlobalTradingContext()
  const [strategies, setStrategies] = useState<Map<string, StrategyConfig>>(new Map())
  const [stats, setStats] = useState<Map<string, StrategyStats>>(new Map())
  const [trades, setTrades] = useState<Map<string, TradeLog[]>>(new Map())
  const [ticks, setTicks] = useState<Map<string, Tick[]>>(new Map())
  const [currentStakes, setCurrentStakes] = useState<Map<string, number>>(new Map())
  const [sessionProfits, setSessionProfits] = useState<Map<string, number>>(new Map())

  const apiClients = useRef<Map<string, DerivAPIClient>>(new Map())
  const analysisIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const subscriptionIds = useRef<Map<string, string>>(new Map())

  const extractLastDigit = (quote: number): number => {
    return Number.parseInt(String(quote).slice(-1))
  }

  const createEmptyStats = (): StrategyStats => ({
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
  })

  const registerStrategy = useCallback((config: StrategyConfig) => {
    setStrategies((prev) => new Map(prev).set(config.id, config))
    setStats((prev) => new Map(prev).set(config.id, createEmptyStats()))
    setTrades((prev) => new Map(prev).set(config.id, []))
    setTicks((prev) => new Map(prev).set(config.id, []))
    setCurrentStakes((prev) => new Map(prev).set(config.id, config.stake))
    setSessionProfits((prev) => new Map(prev).set(config.id, 0))
    console.log(`[v0] Strategy registered: ${config.id}`)
  }, [])

  const updateStrategy = useCallback((id: string, updates: Partial<StrategyConfig>) => {
    setStrategies((prev) => {
      const newMap = new Map(prev)
      const existing = newMap.get(id)
      if (existing) {
        newMap.set(id, { ...existing, ...updates })
      }
      return newMap
    })
  }, [])

  const calculateStats = (tickData: Tick[]): StrategyStats => {
    const digitFrequencies: Record<number, number> = {}
    let evenCount = 0
    let oddCount = 0
    let overCount = 0
    let underCount = 0

    for (let i = 0; i <= 9; i++) {
      digitFrequencies[i] = 0
    }

    tickData.forEach((tick) => {
      digitFrequencies[tick.digit]++
      if (tick.digit % 2 === 0) evenCount++
      else oddCount++
      if (tick.digit >= 5) overCount++
      else underCount++
    })

    const total = tickData.length
    const evenPercent = total > 0 ? (evenCount / total) * 100 : 0
    const oddPercent = total > 0 ? (oddCount / total) * 100 : 0
    const overPercent = total > 0 ? (overCount / total) * 100 : 0
    const underPercent = total > 0 ? (underCount / total) * 100 : 0

    const maxFreq = Math.max(...Object.values(digitFrequencies))
    const power = total > 0 ? (maxFreq / total) * 100 : 0

    let decisionState: "WAIT" | "TRADE_NOW" | "STRONG" | "TRADING" = "WAIT"
    if (power >= 60) decisionState = "STRONG"
    else if (power >= 55) decisionState = "TRADE_NOW"
    else if (power >= 50) decisionState = "WAIT"

    const recentTicks = tickData.slice(-10)
    const olderTicks = tickData.slice(-20, -10)
    const recentFreq: Record<number, number> = {}
    const olderFreq: Record<number, number> = {}

    for (let i = 0; i <= 9; i++) {
      recentFreq[i] = 0
      olderFreq[i] = 0
    }

    recentTicks.forEach((t) => recentFreq[t.digit]++)
    olderTicks.forEach((t) => olderFreq[t.digit]++)

    const recentPower = recentTicks.length > 0 ? (Math.max(...Object.values(recentFreq)) / recentTicks.length) * 100 : 0
    const olderPower = olderTicks.length > 0 ? (Math.max(...Object.values(olderFreq)) / olderTicks.length) * 100 : 0
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
      lastDigits: tickData.slice(-20).map((t) => t.digit),
      momentum,
      power,
    }
  }

  const evaluateStrategy = (config: StrategyConfig, strategyStats: StrategyStats, tickData: Tick[]): boolean => {
    switch (config.type) {
      case "DIFFERS":
        return evaluateDiffers(strategyStats, tickData)
      case "OVER3_UNDER6":
        return evaluateOver3Under6(strategyStats)
      case "OVER2_UNDER7":
        return evaluateOver2Under7(strategyStats)
      case "OVER1_UNDER8":
        return evaluateOver1Under8(strategyStats)
      case "EVEN_ODD":
        return evaluateEvenOdd(strategyStats)
      default:
        return false
    }
  }

  const evaluateDiffers = (strategyStats: StrategyStats, tickData: Tick[]): boolean => {
    const targetDigits = [2, 3, 4, 5, 6, 7]
    const lowFreqDigits = targetDigits.filter((d) => {
      const freq = strategyStats.digitFrequencies[d] || 0
      const percent = strategyStats.sampleSize > 0 ? (freq / strategyStats.sampleSize) * 100 : 0
      return percent < 10
    })

    if (lowFreqDigits.length === 0) return false

    const lastThree = strategyStats.lastDigits.slice(-3)
    const targetDigit = lowFreqDigits[0]
    return lastThree.length === 3 && lastThree.every((d) => d !== targetDigit)
  }

  const evaluateOver3Under6 = (strategyStats: StrategyStats): boolean => {
    let over3Count = 0
    for (let digit = 4; digit <= 9; digit++) {
      over3Count += strategyStats.digitFrequencies[digit] || 0
    }
    const over3Percent = strategyStats.sampleSize > 0 ? (over3Count / strategyStats.sampleSize) * 100 : 0
    return over3Percent >= 55 && strategyStats.momentum === "rising"
  }

  const evaluateOver2Under7 = (strategyStats: StrategyStats): boolean => {
    let over2Count = 0
    for (let digit = 3; digit <= 9; digit++) {
      over2Count += strategyStats.digitFrequencies[digit] || 0
    }
    const over2Percent = strategyStats.sampleSize > 0 ? (over2Count / strategyStats.sampleSize) * 100 : 0
    return over2Percent >= 55 && strategyStats.momentum === "rising"
  }

  const evaluateOver1Under8 = (strategyStats: StrategyStats): boolean => {
    return strategyStats.power >= 58 && strategyStats.momentum === "rising"
  }

  const evaluateEvenOdd = (strategyStats: StrategyStats): boolean => {
    return (strategyStats.evenPercent >= 56 || strategyStats.oddPercent >= 56) && strategyStats.momentum === "rising"
  }

  const getContractType = (strategyType: string, strategyStats: StrategyStats): string => {
    switch (strategyType) {
      case "DIFFERS":
        return "DIGITDIFF"
      case "OVER3_UNDER6":
        return strategyStats.overPercent > strategyStats.underPercent ? "DIGITOVER" : "DIGITUNDER"
      case "OVER2_UNDER7":
        return strategyStats.overPercent > strategyStats.underPercent ? "DIGITOVER" : "DIGITUNDER"
      case "OVER1_UNDER8":
        return "DIGITOVER"
      case "EVEN_ODD":
        return strategyStats.evenPercent > strategyStats.oddPercent ? "DIGITEVEN" : "DIGITODD"
      default:
        return "DIGITODD"
    }
  }

  const getBarrier = (strategyType: string, strategyStats: StrategyStats): string | undefined => {
    switch (strategyType) {
      case "OVER3_UNDER6":
        return strategyStats.overPercent > strategyStats.underPercent ? "3" : "6"
      case "OVER2_UNDER7":
        return strategyStats.overPercent > strategyStats.underPercent ? "2" : "7"
      case "OVER1_UNDER8":
        return "1"
      case "DIFFERS": {
        const targetDigits = [2, 3, 4, 5, 6, 7]
        const lowestDigit = targetDigits.reduce((min, d) =>
          (strategyStats.digitFrequencies[d] || 0) < (strategyStats.digitFrequencies[min] || 0) ? d : min,
        )
        return String(lowestDigit)
      }
      default:
        return undefined
    }
  }

  const executeTrade = async (strategyId: string, strategyStats: StrategyStats) => {
    const config = strategies.get(strategyId)
    const apiClient = apiClients.current.get(strategyId)
    if (!config || !apiClient) return

    updateStrategy(strategyId, { state: "trading" })

    try {
      const currentStake = currentStakes.get(strategyId) || config.stake
      const contractType = getContractType(config.type, strategyStats)
      const barrier = getBarrier(config.type, strategyStats)

      console.log(`[v0] Executing trade for ${strategyId}:`, { contractType, barrier, stake: currentStake })

      const proposal = await apiClient.getProposal({
        amount: currentStake,
        basis: "stake",
        contract_type: contractType,
        currency: "USD",
        duration: config.ticksPerTrade,
        duration_unit: "t",
        symbol: config.marketSymbol,
        barrier: barrier,
      })

      const buyResult = await apiClient.buyContract(proposal.id, proposal.ask_price)

      const trade: TradeLog = {
        id: `trade-${Date.now()}`,
        timestamp: Date.now(),
        contractId: String(buyResult.contract_id),
        proposalId: proposal.id,
        buyPrice: proposal.ask_price,
        payout: proposal.payout,
        result: "pending",
        profit: 0,
        entryTick: strategyStats.lastDigits[strategyStats.lastDigits.length - 1],
        strategyId,
      }

      setTrades((prev) => {
        const newMap = new Map(prev)
        const existing = newMap.get(strategyId) || []
        newMap.set(strategyId, [...existing, trade])
        return newMap
      })

      // Subscribe to contract updates
      apiClient.subscribeProposalOpenContract(buyResult.contract_id, (contract) => {
        handleContractUpdate(strategyId, trade.id, contract)
      })

      console.log(`[v0] Trade executed for ${strategyId}`)
      updateStrategy(strategyId, { state: "analysing" })
    } catch (error) {
      console.error(`[v0] Trade execution error for ${strategyId}:`, error)
      updateStrategy(strategyId, { state: "error" })
    }
  }

  const handleContractUpdate = (strategyId: string, tradeId: string, contract: any) => {
    if (contract.status === "won" || contract.status === "lost") {
      setTrades((prev) => {
        const newMap = new Map(prev)
        const tradeList = newMap.get(strategyId) || []
        const tradeIndex = tradeList.findIndex((t) => t.id === tradeId)

        if (tradeIndex !== -1) {
          const trade = tradeList[tradeIndex]
          const profit = contract.status === "won" ? contract.profit : -trade.buyPrice

          tradeList[tradeIndex] = {
            ...trade,
            result: contract.status === "won" ? "win" : "loss",
            profit,
            exitTick: contract.exit_tick,
          }

          newMap.set(strategyId, tradeList)

          // Update session profit
          setSessionProfits((prevProfits) => {
            const newProfits = new Map(prevProfits)
            const current = newProfits.get(strategyId) || 0
            newProfits.set(strategyId, current + profit)
            return newProfits
          })

          // Handle martingale
          handleMartingale(strategyId, contract.status === "won" ? "win" : "loss")

          console.log(`[v0] Trade ${tradeId} completed: ${contract.status}`)
        }

        return newMap
      })
    }
  }

  const handleMartingale = (strategyId: string, result: "win" | "loss") => {
    const config = strategies.get(strategyId)
    if (!config) return

    setCurrentStakes((prev) => {
      const newMap = new Map(prev)
      const currentStake = newMap.get(strategyId) || config.stake

      if (result === "loss") {
        const newStake = currentStake * config.martingaleMultiplier
        newMap.set(strategyId, newStake)
        console.log(`[v0] Martingale: increased stake to ${newStake} for ${strategyId}`)
      } else {
        newMap.set(strategyId, config.stake)
        console.log(`[v0] Martingale: reset stake to ${config.stake} for ${strategyId}`)
      }

      return newMap
    })
  }

  const startStrategy = async (id: string) => {
    if (!isAuthorized || !apiToken) {
      console.error("[v0] Cannot start strategy: not authorized")
      return
    }

    const config = strategies.get(id)
    if (!config || !config.enabled) return

    try {
      updateStrategy(id, { state: "analysing" })
      console.log(`[v0] Starting strategy ${id}`)

      // Create API client
      const apiClient = new DerivAPIClient({ appId: "106629", token: apiToken })
      await apiClient.connect()
      await apiClient.authorize(apiToken)
      apiClients.current.set(id, apiClient)

      // Subscribe to ticks
      const subId = await apiClient.subscribeTicks(config.marketSymbol, (tick) => {
        setTicks((prev) => {
          const newMap = new Map(prev)
          const tickList = newMap.get(id) || []
          const newTick: Tick = {
            epoch: tick.epoch,
            quote: tick.quote,
            digit: extractLastDigit(tick.quote),
            symbol: tick.symbol,
          }

          tickList.push(newTick)

          // Keep rolling window
          const maxTicks = config.analysisMinutes * 60
          if (tickList.length > maxTicks) {
            tickList.shift()
          }

          newMap.set(id, tickList)
          return newMap
        })
      })

      subscriptionIds.current.set(id, subId)

      // Start analysis loop
      const interval = setInterval(() => {
        const tickData = ticks.get(id) || []
        if (tickData.length === 0) return

        const strategyStats = calculateStats(tickData)
        setStats((prev) => new Map(prev).set(id, strategyStats))

        // Check if should trade
        if (config.state === "analysing") {
          const shouldTrade = evaluateStrategy(config, strategyStats, tickData)
          if (shouldTrade) {
            executeTrade(id, strategyStats)
          }
        }
      }, 1000)

      analysisIntervals.current.set(id, interval)

      console.log(`[v0] Strategy ${id} started successfully`)
    } catch (error) {
      console.error(`[v0] Error starting strategy ${id}:`, error)
      updateStrategy(id, { state: "error" })
    }
  }

  const stopStrategy = async (id: string) => {
    console.log(`[v0] Stopping strategy ${id}`)

    const interval = analysisIntervals.current.get(id)
    if (interval) {
      clearInterval(interval)
      analysisIntervals.current.delete(id)
    }

    const apiClient = apiClients.current.get(id)
    if (apiClient) {
      const subId = subscriptionIds.current.get(id)
      if (subId) {
        await apiClient.forget(subId)
      }
      apiClient.disconnect()
      apiClients.current.delete(id)
    }

    updateStrategy(id, { state: "idle" })
    console.log(`[v0] Strategy ${id} stopped`)
  }

  return {
    strategies: Array.from(strategies.values()),
    stats,
    trades,
    registerStrategy,
    updateStrategy,
    startStrategy,
    stopStrategy,
  }
}
