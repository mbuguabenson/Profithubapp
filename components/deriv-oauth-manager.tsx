"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { User, LogOut } from "lucide-react"

const APP_ID = "106629"
const AFFILIATE_TOKEN = "1mHiO0UpCX6NhxmBqQyZL2Nd7ZgqdRLk"
const UTM_CAMPAIGN = "myaffiliates"

interface AuthData {
  loginid: string
  currency: string
  balance: number
  is_virtual: boolean
  email: string
  fullname?: string
  country?: string
  account_list?: Array<{
    loginid: string
    currency: string
    is_virtual: boolean
  }>
}

interface Balance {
  balance: number
  currency: string
}

interface DerivOAuthManagerProps {
  onAuth?: (data: { ws: WebSocket; token: string; loginid: string }) => void
  theme?: "light" | "dark"
}

export function DerivOAuthManager({ onAuth, theme = "dark" }: DerivOAuthManagerProps) {
  const [authData, setAuthData] = useState<AuthData | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<string>("")

  useEffect(() => {
    const savedToken = localStorage.getItem("deriv_token")
    const savedLoginid = localStorage.getItem("deriv_loginid")

    if (savedToken && savedLoginid) {
      console.log("[v0] 🔐 Found saved OAuth token, auto-connecting...")
      connectToDeriv(savedToken, savedLoginid)
    } else {
      // Check for OAuth code in URL
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get("code")

      if (code) {
        console.log("[v0] 🔐 OAuth code detected, authorizing...")
        authorizeOAuth(code)
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }

    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [])

  const authorizeOAuth = (code: string) => {
    setIsConnecting(true)
    const socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`)

    socket.onopen = () => {
      console.log("[v0] 🔌 WebSocket opened for OAuth authorization")
      socket.send(JSON.stringify({ authorize: code }))
    }

    socket.onmessage = (msg) => {
      const data = JSON.parse(msg.data)

      if (data.error) {
        console.error("[v0] ❌ OAuth error:", data.error.message)
        setIsConnecting(false)
        return
      }

      if (data.authorize) {
        console.log("[v0] ✅ OAuth authorized:", data.authorize.loginid)
        const token = data.authorize.token || code
        const loginid = data.authorize.loginid

        // Save credentials
        localStorage.setItem("deriv_token", token)
        localStorage.setItem("deriv_loginid", loginid)

        // Connect with new credentials
        socket.close()
        connectToDeriv(token, loginid)
      }
    }

    socket.onerror = (error) => {
      console.error("[v0] ❌ OAuth WebSocket error:", error)
      setIsConnecting(false)
    }
  }

  const connectToDeriv = (token: string, loginid: string) => {
    setIsConnecting(true)

    // Close existing connection
    if (ws) {
      ws.close()
    }

    const socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`)

    socket.onopen = () => {
      console.log("[v0] 🔌 WebSocket connected")
      socket.send(JSON.stringify({ authorize: token }))
    }

    socket.onmessage = (msg) => {
      const data = JSON.parse(msg.data)

      if (data.error) {
        console.error("[v0] ❌ WebSocket error:", data.error.message)
        if (data.error.code === "InvalidToken") {
          handleLogout()
        }
        return
      }

      if (data.msg_type === "authorize") {
        const authInfo: AuthData = {
          loginid: data.authorize.loginid,
          currency: data.authorize.currency,
          balance: Number.parseFloat(data.authorize.balance),
          is_virtual: data.authorize.is_virtual === 1,
          email: data.authorize.email,
          fullname: data.authorize.fullname,
          country: data.authorize.country,
          account_list: data.authorize.account_list,
        }

        setAuthData(authInfo)
        setSelectedAccount(data.authorize.loginid)
        setBalance({
          balance: Number.parseFloat(data.authorize.balance),
          currency: data.authorize.currency,
        })
        setIsConnecting(false)

        console.log("[v0] ✅ Logged in as:", data.authorize.loginid)
        console.log("[v0] 💰 Balance:", data.authorize.balance, data.authorize.currency)

        // Subscribe to balance updates
        socket.send(JSON.stringify({ balance: 1, subscribe: 1 }))

        // Notify parent components
        if (onAuth) {
          onAuth({ ws: socket, token, loginid: data.authorize.loginid })
        }
      }

      if (data.msg_type === "balance" && data.balance) {
        console.log("[v0] 💰 Balance update:", data.balance.balance, data.balance.currency)
        setBalance({
          balance: Number.parseFloat(data.balance.balance),
          currency: data.balance.currency,
        })
      }
    }

    socket.onclose = () => {
      console.log("[v0] 🔌 WebSocket disconnected")
    }

    socket.onerror = (error) => {
      console.error("[v0] ❌ WebSocket error:", error)
      setIsConnecting(false)
    }

    setWs(socket)
  }

  const handleLogin = () => {
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname)
    const oauthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&affiliate_token=${AFFILIATE_TOKEN}&utm_campaign=${UTM_CAMPAIGN}&redirect_uri=${redirectUri}`

    console.log("[v0] 🔐 Redirecting to Deriv OAuth...")
    window.location.href = oauthUrl
  }

  const handleLogout = () => {
    console.log("[v0] 👋 Logging out...")

    if (ws) {
      ws.close()
    }

    localStorage.removeItem("deriv_token")
    localStorage.removeItem("deriv_loginid")

    setAuthData(null)
    setBalance(null)
    setWs(null)
    setSelectedAccount("")

    console.log("[v0] ✅ Logged out successfully")
  }

  const handleAccountSwitch = (newLoginid: string) => {
    const token = localStorage.getItem("deriv_token")
    if (!token || !ws) return

    console.log("[v0] 🔄 Switching to account:", newLoginid)

    // Send switch account request
    ws.send(JSON.stringify({ loginid: newLoginid }))
    setSelectedAccount(newLoginid)
    localStorage.setItem("deriv_loginid", newLoginid)
  }

  if (isConnecting) {
    return (
      <div
        className={`text-center p-4 rounded-xl shadow-lg ${
          theme === "dark" ? "bg-gray-900 text-white" : "bg-white text-gray-900"
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          <span className="text-sm">Connecting to Deriv...</span>
        </div>
      </div>
    )
  }

  if (!authData) {
    return (
      <Button
        onClick={handleLogin}
        className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold shadow-lg"
      >
        Login with Deriv
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Account Type Badge */}
      <Badge
        className={
          authData.is_virtual
            ? "bg-yellow-500 text-black hover:bg-yellow-600"
            : "bg-green-600 text-white hover:bg-green-700"
        }
      >
        {authData.is_virtual ? "Demo" : "Real"}
      </Badge>

      {/* Account Code */}
      <span className={`text-sm font-mono font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
        {authData.loginid}
      </span>

      {/* Balance Display */}
      {balance && (
        <div
          className={`px-3 py-1.5 rounded-md ${
            theme === "dark" ? "bg-gray-800/50 border border-green-500/30" : "bg-green-50 border border-green-200"
          }`}
        >
          <span className={`text-sm font-semibold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
            {balance.balance.toFixed(2)} {balance.currency}
          </span>
        </div>
      )}

      {/* Account Switcher */}
      {authData.account_list && authData.account_list.length > 1 && (
        <Select value={selectedAccount} onValueChange={handleAccountSwitch}>
          <SelectTrigger
            className={`w-32 h-9 text-sm ${
              theme === "dark" ? "bg-gray-700 text-white border-blue-500/30" : "bg-white text-gray-900"
            }`}
          >
            <SelectValue placeholder="Switch Account" />
          </SelectTrigger>
          <SelectContent className={theme === "dark" ? "bg-gray-800 text-white" : "bg-white text-gray-900"}>
            {authData.account_list.map((acc) => (
              <SelectItem key={acc.loginid} value={acc.loginid} className="text-sm">
                {acc.loginid} ({acc.is_virtual ? "Demo" : "Real"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* User Avatar */}
      <Avatar className="w-9 h-9 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all">
        <AvatarFallback className={theme === "dark" ? "bg-blue-600" : "bg-blue-500"}>
          <User size={16} className="text-white" />
        </AvatarFallback>
      </Avatar>

      {/* Logout Button */}
      <Button onClick={handleLogout} size="sm" variant="ghost" className="h-9 w-9 p-0">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  )
}
