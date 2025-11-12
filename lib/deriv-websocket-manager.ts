// Prevents "rate limit for ticks" errors by reusing subscriptions and throttling requests

export interface TickSubscription {
  symbol: string
  subscriptionId: string | null
  isActive: boolean
  lastTickTime: number
}

export class DerivWebSocketManager {
  private subscriptions: Map<string, TickSubscription> = new Map()
  private activeSymbol: string | null = null
  private tickThrottleMs = 100 // Minimum ms between tick processing
  private lastTickProcessTime = 0
  private messageQueue: any[] = []
  private isProcessingQueue = false

  constructor(private ws: WebSocket) {}

  /**
   * Subscribe to a single market with proper cleanup of previous subscriptions
   * This prevents rate limiting by ensuring only one active tick stream
   */
  async subscribeSingleMarket(symbol: string): Promise<void> {
    if (this.activeSymbol && this.activeSymbol !== symbol) {
      console.log(`[v0] Switching from ${this.activeSymbol} to ${symbol}`)
      await this.unsubscribeMarket(this.activeSymbol)
      // Give the server time to process the unsubscribe
      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    const existing = this.subscriptions.get(symbol)
    if (existing?.isActive) {
      console.log(`[v0] Already subscribed to ${symbol}, skipping`)
      return
    }

    this.activeSymbol = symbol
    const subscription: TickSubscription = {
      symbol,
      subscriptionId: null,
      isActive: true,
      lastTickTime: Date.now(),
    }

    this.subscriptions.set(symbol, subscription)

    this.sendMessage({
      ticks: symbol,
      subscribe: 1,
    })

    console.log(`[v0] Subscribed to ${symbol}`)
  }

  /**
   * Unsubscribe from a market and clean up resources
   */
  async unsubscribeMarket(symbol: string): Promise<void> {
    const subscription = this.subscriptions.get(symbol)
    if (!subscription) {
      console.log(`[v0] No subscription found for ${symbol}`)
      return
    }

    if (subscription.subscriptionId) {
      this.sendMessage({
        forget: subscription.subscriptionId,
      })
      console.log(`[v0] Sent forget for ${symbol} (ID: ${subscription.subscriptionId})`)
    }

    subscription.isActive = false
    this.subscriptions.delete(symbol)
    console.log(`[v0] Unsubscribed from ${symbol}`)
  }

  /**
   * Unsubscribe from all markets
   */
  async unsubscribeAll(): Promise<void> {
    console.log(`[v0] Unsubscribing from all markets`)
    const symbols = Array.from(this.subscriptions.keys())
    for (const symbol of symbols) {
      await this.unsubscribeMarket(symbol)
    }
    this.activeSymbol = null
  }

  /**
   * Send message with queue management to prevent overwhelming the API
   */
  private sendMessage(message: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
      } catch (error) {
        console.error(`[v0] Failed to send message:`, error)
      }
    } else {
      this.messageQueue.push(message)
    }
  }

  /**
   * Process queued messages when connection is ready
   */
  processQueuedMessages(): void {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return

    this.isProcessingQueue = true
    const processInterval = setInterval(() => {
      if (this.messageQueue.length === 0) {
        clearInterval(processInterval)
        this.isProcessingQueue = false
        return
      }

      if (this.ws.readyState === WebSocket.OPEN) {
        const message = this.messageQueue.shift()
        try {
          this.ws.send(JSON.stringify(message))
        } catch (error) {
          console.error(`[v0] Failed to send queued message:`, error)
        }
      }
    }, 500) // Send one message every 500ms to avoid rate limiting
  }

  /**
   * Handle incoming tick with throttling to prevent processing too many ticks
   */
  shouldProcessTick(): boolean {
    const now = Date.now()
    if (now - this.lastTickProcessTime >= this.tickThrottleMs) {
      this.lastTickProcessTime = now
      return true
    }
    return false
  }

  /**
   * Update subscription ID when received from API
   */
  updateSubscriptionId(symbol: string, subscriptionId: string): void {
    const subscription = this.subscriptions.get(symbol)
    if (subscription) {
      subscription.subscriptionId = subscriptionId
    }
  }

  /**
   * Get active subscription for a symbol
   */
  getSubscription(symbol: string): TickSubscription | undefined {
    return this.subscriptions.get(symbol)
  }

  /**
   * Check if a symbol is actively subscribed
   */
  isSubscribed(symbol: string): boolean {
    const sub = this.subscriptions.get(symbol)
    return sub?.isActive ?? false
  }

  /**
   * Get current active symbol
   */
  getActiveSymbol(): string | null {
    return this.activeSymbol
  }
}
