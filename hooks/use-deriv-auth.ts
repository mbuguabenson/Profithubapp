"use client"

import { useEffect, useState } from "react"
import { DERIV_CONFIG } from "@/lib/deriv-config"

interface Balance {
  amount: number
  currency: string
}

interface Account {
  id: string
  type: "Demo" | "Real"
  currency: string
}

interface AccountInfo {
  loginId: string
  accountType: "Demo" | "Real"
  accountCode: string
  balance: Balance | null
}

export function useDerivAuth() {
  const [token, setToken] = useState<string>("")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [accountType, setAccountType] = useState<"Demo" | "Real" | null>(null)
  const [accountCode, setAccountCode] = useState<string>("")
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activeLoginId, setActiveLoginId] = useState<string | null>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [wsRef, setWsRef] = useState<WebSocket | null>(null)
  const [balanceSubscribed, setBalanceSubscribed] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const storedToken = localStorage.getItem("deriv_api_token")

    if (storedToken && storedToken.length > 10) {
      console.log("[v0] ✅ Existing API token found")
      setToken(storedToken)
      connectWithToken(storedToken)
    } else {
      console.log("[v0] ℹ️ No API token found, showing modal")
      setShowTokenModal(true)
    }

    return () => {
      if (wsRef) {
        wsRef.close()
      }
    }
  }, [])

  const connectWithToken = (apiToken: string) => {
    if (!apiToken || apiToken.length < 10) {
      console.error("[v0] ❌ Invalid API token")
      return
    }

    if (wsRef) {
      wsRef.close()
    }

    console.log("[v0] 🔌 Connecting to Deriv WebSocket...")
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_CONFIG.APP_ID}`)

    ws.onopen = () => {
      console.log("[v0] ✅ WebSocket connected")
      ws.send(JSON.stringify({ authorize: apiToken }))
    }

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data)

      if (data.error) {
        console.error("[v0] ❌ WebSocket error:", data.error.message)
        if (data.error.code === "InvalidToken") {
          console.log("[v0] ⚠️ Invalid token, showing modal again")
          setShowTokenModal(true)
          setIsLoggedIn(false)
        }
        return
      }

      if (data.msg_type === "authorize" && data.authorize) {
        const { authorize } = data
        const accType = authorize.is_virtual ? "Demo" : "Real"
        const accCode = authorize.loginid || ""

        console.log("[v0] ✅ Authorized:", authorize.loginid, `(${accType})`)
        console.log("[v0] 💰 Balance:", authorize.balance, authorize.currency)

        setAccountType(accType)
        setActiveLoginId(authorize.loginid)
        setAccountCode(accCode)
        setIsLoggedIn(true)
        setShowTokenModal(false)

        if (authorize.account_list && Array.isArray(authorize.account_list)) {
          console.log("[v0] 📋 Found", authorize.account_list.length, "linked accounts")
          const formatted = authorize.account_list.map((acc: any) => ({
            id: acc.loginid,
            type: acc.is_virtual ? "Demo" : "Real",
            currency: acc.currency,
          }))
          setAccounts(formatted)
        }

        if (!balanceSubscribed) {
          ws.send(JSON.stringify({ forget_all: ["balance"] }))
          setTimeout(() => {
            ws.send(JSON.stringify({ balance: 1, subscribe: 1 }))
            setBalanceSubscribed(true)
            console.log("[v0] ✅ Balance subscription started")
          }, 100)
        }
      }

      if (data.msg_type === "balance" && data.balance) {
        console.log("[v0] 💰 Balance update:", data.balance.balance, data.balance.currency)
        setBalance({
          amount: data.balance.balance,
          currency: data.balance.currency,
        })
      }
    }

    ws.onclose = () => {
      console.log("[v0] 🔌 WebSocket disconnected")
      setBalanceSubscribed(false)
    }

    ws.onerror = (error) => {
      console.error("[v0] ❌ WebSocket error:", error)
    }

    setWsRef(ws)
  }

  const submitApiToken = (apiToken: string) => {
    if (!apiToken || apiToken.length < 10) {
      alert("Please enter a valid API token (at least 10 characters)")
      return
    }

    localStorage.setItem("deriv_api_token", apiToken)
    setToken(apiToken)
    connectWithToken(apiToken)
  }

  const openTokenSettings = () => {
    setShowTokenModal(true)
  }

  const loginWithDeriv = () => {
    if (typeof window === "undefined") return

    const redirectUri = encodeURIComponent(`${window.location.origin}/dbot`)
    const oauthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${DERIV_CONFIG.APP_ID}&redirect_uri=${redirectUri}`

    console.log("[v0] 🔐 Initiating OAuth login...")
    window.location.href = oauthUrl
  }

  const requestLogin = () => {
    setShowApprovalModal(true)
  }

  const handleApproval = () => {
    setShowApprovalModal(false)
    loginWithDeriv()
  }

  const cancelApproval = () => {
    setShowApprovalModal(false)
  }

  const logout = () => {
    if (typeof window === "undefined") return

    console.log("[v0] 👋 Logging out...")
    if (wsRef) {
      wsRef.send(JSON.stringify({ forget_all: ["balance", "ticks", "proposal_open_contract"] }))
      wsRef.close()
    }
    localStorage.removeItem("deriv_api_token")
    localStorage.removeItem("deriv_token")
    localStorage.removeItem("deriv_account")
    setToken("")
    setIsLoggedIn(false)
    setBalance(null)
    setAccountType(null)
    setAccountCode("")
    setAccounts([])
    setActiveLoginId(null)
    setShowTokenModal(true)
    setBalanceSubscribed(false)
    console.log("[v0] ✅ Logged out successfully")
  }

  const switchAccount = (loginId: string) => {
    if (!token || !loginId || typeof window === "undefined") return

    console.log("[v0] 🔄 Switching to account:", loginId)
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_CONFIG.APP_ID}`)
    ws.onopen = () => {
      ws.send(JSON.stringify({ authorize: token, loginid: loginId }))
    }
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data)
      if (data.msg_type === "authorize") {
        const accType = data.authorize.is_virtual ? "Demo" : "Real"
        const accCode = data.authorize.loginid || ""
        console.log("[v0] ✅ Switched to:", data.authorize.loginid, `(${accType})`)
        setAccountType(accType)
        setActiveLoginId(data.authorize.loginid)
        setAccountCode(accCode)
      }
      ws.close()
    }
  }

  return {
    token,
    isLoggedIn,
    isAuthenticated: isLoggedIn,
    loginWithDeriv,
    requestLogin,
    showApprovalModal,
    handleApproval,
    cancelApproval,
    logout,
    balance,
    accountType,
    accountCode,
    accounts,
    switchAccount,
    activeLoginId,
    showTokenModal,
    submitApiToken,
    openTokenSettings,
  }
}
