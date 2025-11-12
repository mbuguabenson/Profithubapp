export interface DerivAPIConfig {
  appId: string
  token?: string
}

export interface AuthorizeResponse {
  loginid: string
  balance: number
  currency: string
  is_virtual: boolean
  email: string
}

export interface ActiveSymbol {
  symbol: string
  display_name: string
  market: string
  market_display_name: string
}

export interface ContractType {
  contract_type: string
  contract_display: string
  contract_category: string
  contract_category_display: string
  barriers: number
}

export interface ProposalRequest {
  symbol: string
  contract_type: string
  amount: number
  basis: string
  duration: number
  duration_unit: string
  currency: string
  barrier?: string
}

export interface ProposalResponse {
  id: string
  ask_price: number
  payout: number
  spot: number
  spot_time: number
  longcode: string
}

export interface BuyResponse {
  contract_id: number
  buy_price: number
  payout: number
  longcode: string
  start_time: number
  transaction_id: number
}

export interface ContractUpdate {
  contract_id: number
  is_sold: boolean
  profit?: number
  payout?: number
  buy_price: number
  entry_tick?: number
  exit_tick?: number
  entry_spot?: string
  exit_spot?: string
  current_spot?: string
  current_spot_time?: number
  tick_count?: number
  display_name?: string
  status?: string
}

export interface TickData {
  symbol: string
  quote: number
  epoch: number
  id: string
}

export interface TickHistoryResponse {
  prices: number[]
  times: number[]
}

export class DerivAPIClient {
  private ws: WebSocket | null = null
  private reqId = 0
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>()
  private subscriptions = new Map<string, (data: any) => void>()
  private activeSubscriptions = new Map<string, string>()
  private config: DerivAPIConfig
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private isAuthorised = false
  private messageQueue: any[] = []
  private onErrorCallback?: (error: any) => void
  private isConnecting = false
  private connectionPromise: Promise<void> | null = null

  constructor(config: DerivAPIConfig) {
    this.config = config
  }

  setErrorCallback(callback: (error: any) => void) {
    this.onErrorCallback = callback
  }

  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      if (this.ws) {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.onclose = null
          this.ws.onerror = null
          this.ws.close()
        }
        this.ws = null
      }

      this.isConnecting = true

      const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${this.config.appId}`

      try {
        this.ws = new WebSocket(wsUrl)
      } catch (error) {
        console.error("[v0] Failed to create WebSocket:", error)
        this.isConnecting = false
        this.connectionPromise = null
        reject(error)
        return
      }

      const connectionTimeout = setTimeout(() => {
        if (this.isConnecting) {
          console.error("[v0] Connection timeout")
          this.isConnecting = false
          this.connectionPromise = null
          if (this.ws) {
            this.ws.close()
          }
          reject(new Error("Connection timeout"))
        }
      }, 15000)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log("[v0] WebSocket connected")
        this.reconnectAttempts = 0
        this.isConnecting = false
        this.connectionPromise = null

        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift()
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify(msg))
            } catch (error) {
              console.error("[v0] Error sending queued message:", error)
            }
          }
        }

        resolve()
      }

      this.ws.onmessage = (event) => {
        try {
          this.handleMessage(JSON.parse(event.data))
        } catch (error) {
          console.error("[v0] Error parsing message:", error)
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error("[v0] WebSocket error:", error)
        this.isConnecting = false
        this.connectionPromise = null

        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          reject(error)
        }
      }

      this.ws.onclose = () => {
        clearTimeout(connectionTimeout)
        console.log("[v0] WebSocket closed")
        this.isAuthorised = false
        this.isConnecting = false
        this.connectionPromise = null

        this.pendingRequests.forEach((promise) => {
          promise.reject(new Error("Connection closed"))
        })
        this.pendingRequests.clear()

        if (this.config.token && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 15000)
          console.log(
            `[v0] Reconnecting in ${delay}ms... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
          )

          setTimeout(() => {
            this.connect()
              .then(() => {
                if (this.config.token) {
                  return this.authorize(this.config.token)
                }
              })
              .catch((error) => {
                console.error("[v0] Reconnection failed:", error)
              })
          }, delay)
        }
      }
    })

    return this.connectionPromise
  }

  private handleMessage(response: any) {
    if (response.error) {
      console.error("[v0] API Error:", response.error)

      if (this.onErrorCallback) {
        this.onErrorCallback(response.error)
      }

      if (this.pendingRequests.has(response.req_id)) {
        const promise = this.pendingRequests.get(response.req_id)!
        promise.reject(response.error)
        this.pendingRequests.delete(response.req_id)
      }
      return
    }

    if (response.req_id && this.pendingRequests.has(response.req_id)) {
      const promise = this.pendingRequests.get(response.req_id)!
      promise.resolve(response)
      this.pendingRequests.delete(response.req_id)
    }

    if (response.subscription) {
      const callback = this.subscriptions.get(response.subscription.id)
      if (callback) {
        callback(response)
      }
    }
  }

  private send(request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("WebSocket not initialized"))
        return
      }

      if (this.ws.readyState === WebSocket.CONNECTING) {
        const req_id = ++this.reqId
        this.messageQueue.push({ ...request, req_id })
        this.pendingRequests.set(req_id, { resolve, reject })
        return
      }

      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is not connected"))
        return
      }

      const req_id = ++this.reqId
      this.pendingRequests.set(req_id, { resolve, reject })

      const message = { ...request, req_id }

      try {
        this.ws.send(JSON.stringify(message))
      } catch (error) {
        console.error("[v0] Error sending message:", error)
        this.pendingRequests.delete(req_id)
        reject(error)
        return
      }

      setTimeout(() => {
        if (this.pendingRequests.has(req_id)) {
          this.pendingRequests.get(req_id)!.reject(new Error("Request timeout"))
          this.pendingRequests.delete(req_id)
        }
      }, 30000)
    })
  }

  async authorize(token: string): Promise<AuthorizeResponse> {
    this.config.token = token
    const response = await this.send({ authorize: token })
    this.isAuthorised = true
    return response.authorize
  }

  async getActiveSymbols(): Promise<ActiveSymbol[]> {
    const response = await this.send({ active_symbols: "brief", product_type: "basic" })
    return response.active_symbols
  }

  async getContractsFor(symbol: string): Promise<ContractType[]> {
    const response = await this.send({ contracts_for: symbol })
    return response.contracts_for.available
  }

  async getProposal(params: ProposalRequest): Promise<ProposalResponse> {
    const validatedParams = { ...params }

    // For digit contracts, ensure minimum duration and proper symbol
    if (params.contract_type?.includes("DIGIT")) {
      if (params.duration < 5) {
        console.log(`[v0] Adjusting duration from ${params.duration} to 5 for digit contract`)
        validatedParams.duration = 5
      }
      validatedParams.duration_unit = "t" // Force ticks for digit contracts
    }

    // Ensure symbol is a valid continuous index
    if (!validatedParams.symbol || validatedParams.symbol.length === 0) {
      throw new Error("Invalid symbol: Symbol cannot be empty")
    }

    const response = await this.send({
      proposal: 1,
      ...validatedParams,
      basis: validatedParams.basis || "stake",
    })

    if (response.error) {
      console.error("[v0] Proposal error:", response.error)
      throw new Error(response.error.message || "Proposal failed")
    }

    return response.proposal
  }

  async getTickHistory(symbol: string, count = 1000): Promise<TickHistoryResponse> {
    const response = await this.send({
      ticks_history: symbol,
      count: count,
      end: "latest",
      style: "ticks",
    })
    return {
      prices: response.history.prices,
      times: response.history.times,
    }
  }

  async getTick(symbol: string): Promise<TickData> {
    const response = await this.send({ ticks: symbol })
    return response.tick
  }

  async buyContract(proposalId: string, askPrice?: number): Promise<BuyResponse> {
    const buyRequest: any = { buy: proposalId }
    if (askPrice !== undefined && isFinite(askPrice)) {
      buyRequest.price = askPrice
    }
    const response = await this.send(buyRequest)
    return response.buy
  }

  async subscribeBalance(callback: (balance: number, currency: string) => void): Promise<string> {
    const existingSubscription = Array.from(this.subscriptions.keys()).find((key) =>
      key.toLowerCase().includes("balance"),
    )

    if (existingSubscription) {
      console.log("[v0] Already subscribed to balance, reusing existing subscription")
      return existingSubscription
    }

    const response = await this.send({ balance: 1, subscribe: 1 })
    const subscriptionId = response.subscription.id

    this.subscriptions.set(subscriptionId, (data) => {
      if (data.balance) {
        callback(data.balance.balance, data.balance.currency)
      }
    })

    return subscriptionId
  }

  async subscribeProposalOpenContract(
    contractId: number,
    callback: (contract: ContractUpdate) => void,
  ): Promise<string> {
    const response = await this.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 })
    const subscriptionId = response.subscription.id

    this.subscriptions.set(subscriptionId, (data) => {
      if (data.proposal_open_contract) {
        callback(data.proposal_open_contract)
      }
    })

    return subscriptionId
  }

  async subscribeTicks(symbol: string, callback: (tick: TickData) => void): Promise<string> {
    const existingSubscriptionId = this.activeSubscriptions.get(`tick_${symbol}`)
    if (existingSubscriptionId && this.subscriptions.has(existingSubscriptionId)) {
      console.log(`[v0] Reusing existing tick subscription for ${symbol}`)
      // Update callback for existing subscription
      this.subscriptions.set(existingSubscriptionId, (data) => {
        if (data.tick) {
          callback(data.tick)
        }
      })
      return existingSubscriptionId
    }

    // Clear any zombie subscriptions
    await this.clearZombieSubscriptions(symbol)

    try {
      const response = await this.send({ ticks: symbol, subscribe: 1 })
      const subscriptionId = response.subscription.id

      this.subscriptions.set(subscriptionId, (data) => {
        if (data.tick) {
          callback(data.tick)
        }
      })

      this.activeSubscriptions.set(`tick_${symbol}`, subscriptionId)

      console.log(`[v0] Successfully subscribed to ${symbol} with ID: ${subscriptionId}`)
      return subscriptionId
    } catch (error: any) {
      // If already subscribed, just silently reuse the connection
      if (error.message?.includes("already subscribed") || error.code === "AlreadySubscribed") {
        console.log(`[v0] Already subscribed to ${symbol}, reusing connection`)
        // Don't throw error, just return empty subscription ID
        // The existing subscription will continue to work
        return ""
      }
      console.error(`[v0] Failed to subscribe to ${symbol}:`, error)
      throw error
    }
  }

  private async clearZombieSubscriptions(symbol: string): Promise<void> {
    try {
      const oldId = this.activeSubscriptions.get(`tick_${symbol}`)
      if (oldId && !this.subscriptions.has(oldId)) {
        this.activeSubscriptions.delete(`tick_${symbol}`)
        console.log(`[v0] Cleared zombie subscription reference for ${symbol}`)
      }
    } catch (error) {
      console.log(`[v0] Error clearing zombie subscriptions:`, error)
    }
  }

  async forget(subscriptionId: string): Promise<void> {
    if (!subscriptionId) return
    try {
      await this.send({ forget: subscriptionId })
      this.subscriptions.delete(subscriptionId)

      for (const [key, value] of this.activeSubscriptions.entries()) {
        if (value === subscriptionId) {
          this.activeSubscriptions.delete(key)
          console.log(`[v0] Cleaned up subscription reference: ${key}`)
          break
        }
      }
    } catch (error) {
      console.log("[v0] Forget error (ignored):", error)
    }
  }

  async forgetAll(...types: string[]): Promise<void> {
    try {
      const forgetTypes = types.length > 0 ? types : ["balance", "ticks", "proposal_open_contract"]
      await this.send({ forget_all: forgetTypes })

      console.log(`[v0] Forgetting all subscriptions for types: ${forgetTypes.join(", ")}`)

      this.subscriptions.clear()
      this.activeSubscriptions.clear()

      console.log("[v0] All subscriptions cleared")
    } catch (error) {
      console.log("[v0] ForgetAll error (ignored):", error)
    }
  }

  async clearSubscription(type: string): Promise<void> {
    try {
      await this.send({ forget_all: type })
      const keysToDelete: string[] = []
      this.subscriptions.forEach((_, key) => {
        if (key.includes(type)) {
          keysToDelete.push(key)
        }
      })
      keysToDelete.forEach((key) => this.subscriptions.delete(key))

      if (type === "ticks") {
        for (const key of Array.from(this.activeSubscriptions.keys())) {
          if (key.startsWith("tick_")) {
            this.activeSubscriptions.delete(key)
          }
        }
      }
    } catch (error) {
      console.log("[v0] Clear subscription error (ignored):", error)
    }
  }

  disconnect() {
    this.connectionPromise = null

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.onclose = null
        this.ws.onerror = null
        this.ws.close()
      }
      this.ws = null
    }
    this.isAuthorised = false
    this.isConnecting = false
    this.pendingRequests.clear()
    this.subscriptions.clear()
    this.activeSubscriptions.clear()
    this.messageQueue = []
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  isAuth(): boolean {
    return this.isAuthorised
  }
}
