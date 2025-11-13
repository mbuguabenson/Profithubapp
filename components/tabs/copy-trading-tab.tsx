"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, ExternalLink, TrendingUp, TrendingDown } from "lucide-react"

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
      localStorage.setItem("copyTrading_masterToken", apiToken)

      // Simulate API connection
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const accountId = `CR${Math.floor(Math.random() * 1000000)}`
      const accountBalance = (Math.random() * 1000 + 100).toFixed(2)
      const accType = apiToken.toLowerCase().includes("demo") ? "Demo" : "Real"

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
            ? "bg-gradient-to-br from-[#0f1629]/90 to-[#1a2235]/90 border-blue-500/30 shadow-[0_0_40px_rgba(59,130,246,0.3)]"
            : "bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200 shadow-xl"
        }`}
      >
        <h2
          className={`text-3xl font-bold mb-2 ${
            theme === "dark"
              ? "bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent"
              : "bg-gradient-to-r from-blue-600 via-cyan-600 to-purple-600 bg-clip-text text-transparent"
          }`}
        >
          🎯 Copy Trading Dashboard
        </h2>
        <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          Connect your master trading account and mirror trades across the platform with real-time synchronization
        </p>
      </div>

      {/* Master Account Connection */}
      <Card
        className={`border-2 ${
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/30"
            : "bg-white border-blue-200"
        }`}
      >
        <CardHeader>
          <CardTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>Master Account</CardTitle>
          <CardDescription className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            {isConnected
              ? "Your master account is connected and syncing trades in real-time"
              : "Connect your Deriv account via API token to enable copy trading"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <div className="space-y-4">
              <div>
                <Label className={`text-sm font-semibold ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  API Token
                </Label>
                <Input
                  type="password"
                  placeholder="Enter your Deriv API token"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className={`mt-2 ${
                    theme === "dark"
                      ? "bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                      : "bg-white border-gray-300"
                  }`}
                />
                <p className={`text-xs mt-2 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
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
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold"
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className={`p-5 rounded-xl border-2 ${
                    theme === "dark"
                      ? "bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/50"
                      : "bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-300"
                  }`}
                >
                  <div className={`text-xs font-semibold ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Account ID
                  </div>
                  <div className={`text-xl font-bold mt-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {masterAccount}
                  </div>
                  <Badge
                    className={`mt-3 ${
                      accountType === "Real"
                        ? "bg-green-500/30 text-green-300 border-green-500/50"
                        : "bg-yellow-500/30 text-yellow-300 border-yellow-500/50"
                    }`}
                  >
                    {accountType} Account
                  </Badge>
                </div>
                <div
                  className={`p-5 rounded-xl border-2 ${
                    theme === "dark"
                      ? "bg-gradient-to-br from-emerald-500/20 to-green-500/20 border-emerald-500/50"
                      : "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-300"
                  }`}
                >
                  <div className={`text-xs font-semibold ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Balance
                  </div>
                  <div
                    className={`text-3xl font-bold mt-2 ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}
                  >
                    ${balance}
                  </div>
                  <div className={`text-xs mt-2 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>USD</div>
                </div>
              </div>
              <Button
                onClick={handleDisconnect}
                variant="outline"
                className={`w-full ${
                  theme === "dark"
                    ? "border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
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
            className={`border-2 ${
              theme === "dark"
                ? "bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/50"
                : "bg-gradient-to-br from-green-50 to-emerald-50 border-green-300"
            }`}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-sm font-semibold ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Total Profit
                  </div>
                  <div className={`text-3xl font-bold mt-2 ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                    ${totalProfit.toFixed(2)}
                  </div>
                </div>
                <TrendingUp className={`h-8 w-8 ${theme === "dark" ? "text-green-400" : "text-green-600"}`} />
              </div>
            </CardContent>
          </Card>
          <Card
            className={`border-2 ${
              theme === "dark"
                ? "bg-gradient-to-br from-red-500/20 to-rose-500/20 border-red-500/50"
                : "bg-gradient-to-br from-red-50 to-rose-50 border-red-300"
            }`}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-sm font-semibold ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Total Loss
                  </div>
                  <div className={`text-3xl font-bold mt-2 ${theme === "dark" ? "text-red-400" : "text-red-600"}`}>
                    ${totalLoss.toFixed(2)}
                  </div>
                </div>
                <TrendingDown className={`h-8 w-8 ${theme === "dark" ? "text-red-400" : "text-red-600"}`} />
              </div>
            </CardContent>
          </Card>
          <Card
            className={`border-2 ${
              netPL >= 0
                ? theme === "dark"
                  ? "bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/50"
                  : "bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-300"
                : theme === "dark"
                  ? "bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-500/50"
                  : "bg-gradient-to-br from-orange-50 to-red-50 border-orange-300"
            }`}
          >
            <CardContent className="pt-6">
              <div>
                <div className={`text-sm font-semibold ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Net P/L
                </div>
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
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trade Logs */}
      <Card
        className={`border-2 ${
          theme === "dark"
            ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/30"
            : "bg-white border-blue-200"
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
                  className={`flex justify-between items-center p-4 rounded-xl border-2 ${
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
                    <div className={`text-sm font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {log.symbol} - {log.type}
                    </div>
                    <div className={`text-xs mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      Stake: ${log.stake.toFixed(2)}
                    </div>
                    <div
                      className={`text-xl font-bold mt-1 ${
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
