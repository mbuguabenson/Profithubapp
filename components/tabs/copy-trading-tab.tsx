"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, ExternalLink } from "lucide-react"

interface TradeLog {
  id: string
  symbol: string
  type: string
  stake: number
  profit: number
  result: "WIN" | "LOSS"
  timestamp: string
}

interface CopyTradingTabProps {
  theme?: "light" | "dark"
}

export function CopyTradingTab({ theme = "dark" }: CopyTradingTabProps) {
  const [apiToken, setApiToken] = useState("")
  const [masterAccount, setMasterAccount] = useState("")
  const [accountType, setAccountType] = useState("Demo")
  const [balance, setBalance] = useState("0.00")
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Load data from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("copyTrading_masterToken")
    const savedAccount = localStorage.getItem("copyTrading_masterAccount")
    const savedAccountType = localStorage.getItem("copyTrading_accountType")
    const savedBalance = localStorage.getItem("copyTrading_balance")
    const savedLogs = localStorage.getItem("copyTrading_tradeLogs")

    if (savedToken) setApiToken(savedToken)
    if (savedAccount) {
      setMasterAccount(savedAccount)
      setIsConnected(true)
    }
    if (savedAccountType) setAccountType(savedAccountType)
    if (savedBalance) setBalance(savedBalance)
    if (savedLogs) setTradeLogs(JSON.parse(savedLogs))
  }, [])

  // Listen for storage events (cross-tab updates)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "copyTrading_tradeLogs" && event.newValue) {
        setTradeLogs(JSON.parse(event.newValue))
      }
      if (event.key === "copyTrading_balance" && event.newValue) {
        setBalance(event.newValue)
      }
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [])

  const handleConnect = async () => {
    if (!apiToken.trim()) {
      alert("Please enter an API token")
      return
    }

    setIsLoading(true)

    try {
      // Save to localStorage
      localStorage.setItem("copyTrading_masterToken", apiToken)

      // Simulate API connection (replace with actual Deriv API call)
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Mock account details
      const accountId = `CR${Math.floor(Math.random() * 1000000)}`
      const accountBalance = (Math.random() * 1000 + 100).toFixed(2)
      const accType = apiToken.includes("demo") ? "Demo" : "Real"

      setMasterAccount(accountId)
      setAccountType(accType)
      setBalance(accountBalance)
      setIsConnected(true)

      localStorage.setItem("copyTrading_masterAccount", accountId)
      localStorage.setItem("copyTrading_accountType", accType)
      localStorage.setItem("copyTrading_balance", accountBalance)
    } catch (error) {
      console.error("[v0] Connection error:", error)
      alert("Failed to connect. Please check your API token.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnect = () => {
    setIsConnected(false)
    setMasterAccount("")
    setApiToken("")
    localStorage.removeItem("copyTrading_masterToken")
    localStorage.removeItem("copyTrading_masterAccount")
    localStorage.removeItem("copyTrading_accountType")
  }

  const totalProfit = tradeLogs.reduce((sum, log) => sum + (log.result === "WIN" ? log.profit : 0), 0)
  const totalLoss = tradeLogs.reduce((sum, log) => sum + (log.result === "LOSS" ? Math.abs(log.profit) : 0), 0)
  const netPL = totalProfit - totalLoss

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className={`rounded-xl p-6 border ${
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.2)]"
            : "bg-white border-gray-200 shadow-lg"
        }`}
      >
        <h2
          className={`text-3xl font-bold mb-2 ${
            theme === "dark"
              ? "bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent"
              : "text-gray-900"
          }`}
        >
          🎯 Copy Trading Dashboard
        </h2>
        <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          Connect your master trading account and mirror trades across the platform
        </p>
      </div>

      {/* Master Account Connection */}
      <Card
        className={`border ${
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
            : "bg-white border-gray-200"
        }`}
      >
        <CardHeader>
          <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>Master Account</CardTitle>
          <CardDescription className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            {isConnected
              ? "Your master account is connected and ready for copy trading"
              : "Connect your Deriv account to enable copy trading"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <div className="space-y-4">
              <div>
                <Label className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>API Token</Label>
                <Input
                  type="password"
                  placeholder="Enter your Deriv API token"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className={`mt-1 ${
                    theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-300"
                  }`}
                />
                <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                  Get your API token from{" "}
                  <a
                    href="https://app.deriv.com/account/api-token"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1"
                  >
                    Deriv Dashboard
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
              <Button
                onClick={handleConnect}
                disabled={isLoading || !apiToken.trim()}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect Master Account"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`p-4 rounded-lg border ${
                    theme === "dark" ? "bg-blue-500/10 border-blue-500/30" : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Account ID</div>
                  <div className={`text-lg font-bold mt-1 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {masterAccount}
                  </div>
                  <Badge
                    className={`mt-2 ${
                      accountType === "Real"
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    }`}
                  >
                    {accountType}
                  </Badge>
                </div>
                <div
                  className={`p-4 rounded-lg border ${
                    theme === "dark" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-emerald-50 border-emerald-200"
                  }`}
                >
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Balance</div>
                  <div
                    className={`text-2xl font-bold mt-1 ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}
                  >
                    ${balance}
                  </div>
                  <div className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>USD</div>
                </div>
              </div>
              <Button
                onClick={handleDisconnect}
                variant="outline"
                className={`w-full ${
                  theme === "dark"
                    ? "border-red-500/50 text-red-400 hover:bg-red-500/10"
                    : "border-red-300 text-red-600 hover:bg-red-50"
                }`}
              >
                Disconnect Account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Overview */}
      {isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            className={`border ${
              theme === "dark"
                ? "bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30"
                : "bg-green-50 border-green-200"
            }`}
          >
            <CardContent className="pt-6">
              <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Total Profit</div>
              <div className={`text-3xl font-bold mt-2 ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                ${totalProfit.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card
            className={`border ${
              theme === "dark"
                ? "bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-500/30"
                : "bg-red-50 border-red-200"
            }`}
          >
            <CardContent className="pt-6">
              <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Total Loss</div>
              <div className={`text-3xl font-bold mt-2 ${theme === "dark" ? "text-red-400" : "text-red-600"}`}>
                ${totalLoss.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card
            className={`border ${
              netPL >= 0
                ? theme === "dark"
                  ? "bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30"
                  : "bg-blue-50 border-blue-200"
                : theme === "dark"
                  ? "bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/30"
                  : "bg-orange-50 border-orange-200"
            }`}
          >
            <CardContent className="pt-6">
              <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>Net P/L</div>
              <div
                className={`text-3xl font-bold mt-2 ${
                  netPL >= 0
                    ? theme === "dark"
                      ? "text-blue-400"
                      : "text-blue-600"
                    : theme === "dark"
                      ? "text-orange-400"
                      : "text-orange-600"
                }`}
              >
                {netPL >= 0 ? "+" : ""}${netPL.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trade Logs */}
      <Card
        className={`border ${
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20"
            : "bg-white border-gray-200"
        }`}
      >
        <CardHeader>
          <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>📈 Trade Logs</CardTitle>
          <CardDescription className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            Real-time trade history synchronized across all tabs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {tradeLogs.length === 0 ? (
              <div className="text-center py-12">
                <p className={`text-sm ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                  No trades yet. Start trading to see logs here.
                </p>
              </div>
            ) : (
              tradeLogs.map((log) => (
                <div
                  key={log.id}
                  className={`flex justify-between items-center p-3 rounded-lg border ${
                    log.result === "WIN"
                      ? theme === "dark"
                        ? "bg-green-500/10 border-green-500/30"
                        : "bg-green-50 border-green-200"
                      : theme === "dark"
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex-1">
                    <div className={`text-sm font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {log.symbol} - {log.type}
                    </div>
                    <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      Stake: ${log.stake.toFixed(2)}
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        log.result === "WIN"
                          ? theme === "dark"
                            ? "text-green-400"
                            : "text-green-600"
                          : theme === "dark"
                            ? "text-red-400"
                            : "text-red-600"
                      }`}
                    >
                      {log.result} ({log.profit >= 0 ? "+" : ""}${log.profit.toFixed(2)})
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
