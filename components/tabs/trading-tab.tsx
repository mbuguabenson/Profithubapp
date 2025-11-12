"use client"
import { useCallback, useState, useEffect } from "react"
import { useDerivAPI } from "@/lib/deriv-api-context"
import { useDerivAuth } from "@/hooks/use-deriv-auth"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Settings, AlertCircle } from "lucide-react"
import { ManualTrader } from "./manual-trader"
import { AutoRunBot } from "./autorun-bot"
import { SpeedBot } from "./speedbot"
import { TradingJournal } from "@/lib/trading-journal"

interface TradingTabProps {
  theme?: "light" | "dark"
}

export function TradingTab({ theme: propTheme }: TradingTabProps) {
  const {
    token: globalApiToken,
    isLoggedIn,
    balance: globalBalance,
    accountType: globalAccountType,
    accountCode: globalAccountCode,
  } = useDerivAuth()

  const { apiClient, isConnected, isAuthorized, error, connectionStatus } = useDerivAPI()

  const currentThemeFromProps = propTheme || "dark"

  const balance = globalBalance?.amount || 0
  const currency = globalBalance?.currency || "USD"
  const accountType = globalAccountType || "DEMO"
  const loginId = globalAccountCode || ""

  const [activeSymbols, setActiveSymbols] = useState<any[]>([])
  const [markets, setMarkets] = useState<string[]>([])
  const [submarkets, setSubmarkets] = useState<Record<string, string[]>>({})
  const [instruments, setInstruments] = useState<Record<string, any[]>>({})
  const [contractsCache, setContractsCache] = useState<Record<string, any>>({})
  const [loadingMarkets, setLoadingMarkets] = useState(false)
  const [marketError, setMarketError] = useState<string | null>(null)

  const [currentTheme, setCurrentTheme] = useState(currentThemeFromProps)
  const [activeTab, setActiveTab] = useState("manual")

  const [selectedMarket, setSelectedMarket] = useState<string>("")
  const [selectedSubmarket, setSelectedSubmarket] = useState<string>("")
  const [selectedSymbol, setSelectedSymbol] = useState<string>("")

  const [currentTick, setCurrentTick] = useState<number | null>(null)
  const [tickTimestamp, setTickTimestamp] = useState<string>("")

  const logJournal = useCallback((message: string, type: "info" | "success" | "error" | "warn" = "info") => {
    console.log(`[${type.toUpperCase()}] ${message}`)
  }, [])

  useEffect(() => {
    setIsConnectedState(isConnected)
    setIsAuthorisedState(isAuthorized)
  }, [apiClient, isConnected, isAuthorized])

  const [isConnectedState, setIsConnectedState] = useState(false)
  const [isAuthorisedState, setIsAuthorisedState] = useState(false)

  useEffect(() => {
    if (apiClient && isConnected && isAuthorized) {
      setIsConnectedState(true)
      setIsAuthorisedState(true)

      apiClient
        .forgetAll("balance", "ticks", "proposal_open_contract")
        .then(() => {
          loadMarketsAndSymbols()
        })
        .catch((err) => {
          console.log("[v0] ForgetAll error (non-critical):", err)
          loadMarketsAndSymbols()
        })
    } else {
      setIsConnectedState(false)
      setIsAuthorisedState(false)
    }
  }, [apiClient, isConnected, isAuthorized])

  const loadMarketsAndSymbols = async () => {
    if (!apiClient) {
      setMarketError("API client not available")
      return
    }

    try {
      setLoadingMarkets(true)
      setMarketError(null)
      const symbols = await apiClient.getActiveSymbols()

      if (!symbols || symbols.length === 0) {
        setMarketError("No markets available")
        logJournal("No markets available from API", "warn")
        return
      }

      const continuousIndices = symbols.filter((symbol: any) => {
        const market = symbol.market?.toLowerCase() || ""
        const submarket = symbol.submarket?.toLowerCase() || ""
        const display = symbol.display_name?.toLowerCase() || ""

        return (
          market === "synthetic_index" ||
          submarket.includes("crash") ||
          submarket.includes("boom") ||
          submarket.includes("volatility") ||
          submarket.includes("jump") ||
          submarket.includes("step") ||
          display.includes("volatility") ||
          display.includes("crash") ||
          display.includes("boom")
        )
      })

      const marketGroups: Record<string, Record<string, any[]>> = {}
      const uniqueMarkets = new Set<string>()

      continuousIndices.forEach((symbol: any) => {
        const market = symbol.market || "synthetic_index"
        const submarket = symbol.submarket || "other"

        uniqueMarkets.add(market)

        if (!marketGroups[market]) {
          marketGroups[market] = {}
        }
        if (!marketGroups[market][submarket]) {
          marketGroups[market][submarket] = []
        }
        marketGroups[market][submarket].push(symbol)
      })

      setMarkets(Array.from(uniqueMarkets))
      setSubmarkets(
        Object.keys(marketGroups).reduce(
          (acc, market) => {
            acc[market] = Object.keys(marketGroups[market])
            return acc
          },
          {} as Record<string, string[]>,
        ),
      )
      setInstruments(
        Object.keys(marketGroups).reduce(
          (acc, market) => {
            Object.keys(marketGroups[market]).forEach((submarket) => {
              const key = `${market}_${submarket}`
              acc[key] = marketGroups[market][submarket]
            })
            return acc
          },
          {} as Record<string, any[]>,
        ),
      )
      setActiveSymbols(continuousIndices)

      const defaultMarket = Array.from(uniqueMarkets)[0]
      const defaultSubmarket = Object.keys(marketGroups[defaultMarket])[0]
      const defaultSymbol = marketGroups[defaultMarket][defaultSubmarket][0].symbol

      setSelectedMarket(defaultMarket)
      setSelectedSubmarket(defaultSubmarket)
      setSelectedSymbol(defaultSymbol)

      await loadContractsForMarket(defaultSymbol)

      logJournal(
        `Continuous Indices loaded: ${uniqueMarkets.size} markets with ${continuousIndices.length} instruments`,
        "success",
      )
    } catch (error: any) {
      console.error("[v0] Error loading markets:", error)
      setMarketError(error.message || "Failed to load markets")
      logJournal("Error loading markets: " + error.message, "error")
    } finally {
      setLoadingMarkets(false)
    }
  }

  const loadContractsForMarket = async (symbol: string) => {
    if (!apiClient || !symbol) return

    try {
      const contracts = await apiClient.getContractsFor(symbol)

      if (!contracts || contracts.length === 0) {
        return
      }

      const grouped: Record<string, any[]> = {}
      contracts.forEach((contract: any) => {
        const category = contract.contract_category || "Other"
        if (!grouped[category]) {
          grouped[category] = []
        }
        grouped[category].push(contract)
      })

      setContractsCache((prev) => ({
        ...prev,
        [symbol]: grouped,
      }))

      logJournal(`Contracts loaded for ${symbol}`, "success")
    } catch (error: any) {
      console.error("[v0] Failed to load contracts:", error)
      logJournal(`Failed to load contracts for ${symbol}: ${error.message}`, "error")
    }
  }

  useEffect(() => {
    if (!apiClient || !selectedSymbol || !isConnected || !isAuthorized) return

    let tickSubscriptionId: string | null = null

    const subscribeTicks = async () => {
      try {
        tickSubscriptionId = await apiClient.subscribeTicks(selectedSymbol, (tick: any) => {
          if (tick.quote) {
            setCurrentTick(tick.quote)
            setTickTimestamp(new Date(tick.epoch * 1000).toLocaleTimeString())
          }
        })
      } catch (error: any) {
        console.log("[v0] Tick subscription info:", error.message)
      }
    }

    subscribeTicks()

    return () => {
      if (tickSubscriptionId && apiClient) {
        apiClient.forget(tickSubscriptionId).catch(() => {})
      }
    }
  }, [apiClient, selectedSymbol, isConnected, isAuthorized])

  const [manualJournal] = useState(() => new TradingJournal("manual-trader"))
  const [autorunJournal] = useState(() => new TradingJournal("autorun-bot"))
  const [speedbotJournal] = useState(() => new TradingJournal("speedbot"))

  const [manualStats, setManualStats] = useState(manualJournal.getStats())
  const [autorunStats, setAutorunStats] = useState(autorunJournal.getStats())
  const [speedbotStats, setSpeedbotStats] = useState(speedbotJournal.getStats())

  useEffect(() => {
    manualJournal.on("stats-updated", setManualStats)
    autorunJournal.on("stats-updated", setAutorunStats)
    speedbotJournal.on("stats-updated", setSpeedbotStats)

    return () => {
      manualJournal.removeAllListeners()
      autorunJournal.removeAllListeners()
      speedbotJournal.removeAllListeners()
    }
  }, [])

  const handleMarketChange = useCallback(
    (market: string) => {
      setSelectedMarket(market)
      const firstSubmarket = submarkets[market]?.[0] || ""
      setSelectedSubmarket(firstSubmarket)
      const key = `${market}_${firstSubmarket}`
      const firstInstrument = instruments[key]?.[0]
      if (firstInstrument) {
        setSelectedSymbol(firstInstrument.symbol)
        loadContractsForMarket(firstInstrument.symbol)
      }
    },
    [submarkets, instruments],
  )

  const handleSubmarketChange = useCallback(
    (submarket: string) => {
      setSelectedSubmarket(submarket)
      const key = `${selectedMarket}_${submarket}`
      const firstInstrument = instruments[key]?.[0]
      if (firstInstrument) {
        setSelectedSymbol(firstInstrument.symbol)
        loadContractsForMarket(firstInstrument.symbol)
      }
    },
    [selectedMarket, instruments],
  )

  const handleSymbolChange = useCallback((symbol: string) => {
    setSelectedSymbol(symbol)
    loadContractsForMarket(symbol)
  }, [])

  return (
    <div
      className={`w-full rounded-lg p-3 sm:p-4 border ${currentTheme === "dark" ? "bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border-blue-500/20" : "bg-white border-gray-200"}`}
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-blue-500/20">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isConnectedState && isAuthorisedState ? "bg-green-400 animate-pulse" : connectionStatus === "reconnecting" ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`}
          />
          <span
            className={`text-xs sm:text-sm font-medium ${currentTheme === "dark" ? "text-gray-300" : "text-gray-700"}`}
          >
            {connectionStatus === "connecting"
              ? "Connecting..."
              : connectionStatus === "reconnecting"
                ? "Reconnecting..."
                : isConnectedState && isAuthorisedState
                  ? "Connected"
                  : "Disconnected"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <h2 className={`text-base sm:text-lg font-bold ${currentTheme === "dark" ? "text-white" : "text-gray-900"}`}>
            Trade Now - Continuous Indices
          </h2>
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">{accountType}</Badge>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs font-bold">
              {balance.toFixed(2)} {currency}
            </Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className={`p-3 rounded-lg border mb-4 flex items-start gap-2 ${currentTheme === "dark" ? "bg-red-500/10 border-red-500/30" : "bg-red-50 border-red-200"}`}
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-400" />
          <div>
            <p className={`text-sm font-medium ${currentTheme === "dark" ? "text-red-400" : "text-red-600"}`}>
              Connection Error
            </p>
            <p className={`text-xs mt-1 ${currentTheme === "dark" ? "text-red-300" : "text-red-500"}`}>{error}</p>
          </div>
        </div>
      )}

      {!isConnectedState || !isAuthorisedState ? (
        <div
          className={`p-4 rounded-lg border text-center ${currentTheme === "dark" ? "bg-red-500/10 border-red-500/30" : "bg-red-50 border-red-200"}`}
        >
          <p className={`text-sm ${currentTheme === "dark" ? "text-red-400" : "text-red-600"}`}>
            {connectionStatus === "connecting"
              ? "Connecting to API..."
              : connectionStatus === "reconnecting"
                ? "Reconnecting to API..."
                : "Waiting for authorization..."}
          </p>
          <p className={`text-xs mt-2 ${currentTheme === "dark" ? "text-gray-600" : "text-gray-600"}`}>
            Please ensure you have entered a valid API token
          </p>
        </div>
      ) : (
        <>
          {currentTick !== null && (
            <div
              className={`p-4 rounded-lg border mb-4 ${currentTheme === "dark" ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30" : "bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200"}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className={`text-xs font-semibold mb-1 ${currentTheme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                  >
                    Current Tick Price
                  </div>
                  <div className={`text-2xl font-bold ${currentTheme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                    {currentTick.toFixed(4)}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-xs font-semibold mb-1 ${currentTheme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                  >
                    Timestamp
                  </div>
                  <div className={`text-sm ${currentTheme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                    {tickTimestamp}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-xs font-semibold mb-1 ${currentTheme === "dark" ? "text-gray-400" : "text-gray-600"}`}
                  >
                    Symbol
                  </div>
                  <div
                    className={`text-sm font-bold ${currentTheme === "dark" ? "text-orange-400" : "text-orange-600"}`}
                  >
                    {selectedSymbol}
                  </div>
                </div>
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
            <TabsList
              className={`grid w-full grid-cols-3 mb-6 h-12 ${currentTheme === "dark" ? "bg-[#0a0e27]/50 border border-blue-500/20" : "bg-gray-100"}`}
            >
              <TabsTrigger
                value="manual"
                className="text-sm font-semibold data-[state=active]:bg-blue-500 data-[state=active]:text-white"
              >
                Manual Trading
              </TabsTrigger>
              <TabsTrigger
                value="autorun"
                className="text-sm font-semibold data-[state=active]:bg-green-500 data-[state=active]:text-white"
              >
                AutoRun
              </TabsTrigger>
              <TabsTrigger
                value="speedbot"
                className="text-sm font-semibold data-[state=active]:bg-purple-500 data-[state=active]:text-white"
              >
                SpeedBot
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="space-y-4 mt-4">
              <ManualTrader
                apiClient={apiClient}
                isAuthorized={isAuthorized}
                balance={balance}
                currency={currency}
                theme={currentTheme}
                activeSymbols={activeSymbols}
                contractsCache={contractsCache}
                journal={manualJournal}
                selectedSymbol={selectedSymbol}
              />
            </TabsContent>

            <TabsContent value="autorun" className="space-y-4 mt-4">
              <AutoRunBot
                apiClient={apiClient}
                isAuthorized={isAuthorized}
                balance={balance}
                currency={currency}
                theme={currentTheme}
                activeSymbols={activeSymbols}
                contractsCache={contractsCache}
                journal={autorunJournal}
                selectedSymbol={selectedSymbol}
              />
            </TabsContent>

            <TabsContent value="speedbot" className="space-y-4 mt-4">
              <SpeedBot
                apiClient={apiClient}
                isAuthorized={isAuthorized}
                balance={balance}
                currency={currency}
                theme={currentTheme}
                activeSymbols={activeSymbols}
                contractsCache={contractsCache}
                journal={speedbotJournal}
                selectedSymbol={selectedSymbol}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
