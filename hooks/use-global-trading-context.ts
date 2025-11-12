"use client"

import { useEffect, useState } from "react"
import { useDerivAuth } from "@/hooks/use-deriv-auth"

export interface GlobalTradingContext {
  apiToken: string
  isAuthorized: boolean
  balance: number
  selectedMarket: string
  selectedStrategy: string
  isTrading: boolean
  sharedWebSocket: any | null
  setSelectedMarket: (market: string) => void
  setSelectedStrategy: (strategy: string) => void
  setIsTrading: (trading: boolean) => void
  setSharedWebSocket: (ws: any) => void
}

export function useGlobalTradingContext(): GlobalTradingContext {
  const { token, isLoggedIn, balance } = useDerivAuth()
  const [selectedMarket, setSelectedMarket] = useState("1HZ100V")
  const [selectedStrategy, setSelectedStrategy] = useState("OVER3_UNDER6")
  const [isTrading, setIsTrading] = useState(false)
  const [sharedWebSocket, setSharedWebSocket] = useState<any>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = localStorage.getItem("deriv_selected_market")
    if (saved) setSelectedMarket(saved)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem("deriv_selected_market", selectedMarket)
  }, [selectedMarket])

  console.log("[v0] ✅ Global Trading Context - API Token:", token ? "Set" : "Not Set", "Balance:", balance?.amount)

  return {
    apiToken: token,
    isAuthorized: isLoggedIn,
    balance: balance?.amount || 0,
    selectedMarket,
    selectedStrategy,
    isTrading,
    sharedWebSocket,
    setSelectedMarket,
    setSelectedStrategy,
    setIsTrading,
    setSharedWebSocket,
  }
}
