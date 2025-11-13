export class TickHistoryManager {
  private tickBuffers = new Map<string, number[]>()
  private subscriptions = new Map<string, string>()
  private isLoading = false
  private loadQueue: Array<{ symbol: string; count: number; resolve: () => void }> = []
  private apiClient: any

  constructor(apiClient: any) {
    this.apiClient = apiClient
  }

  async loadTickHistorySequentially(symbols: string[], count = 100): Promise<void> {
    console.log(`[v0] Loading tick history for ${symbols.length} symbols sequentially...`)

    for (const symbol of symbols) {
      try {
        console.log(`[v0] Fetching history for ${symbol}...`)
        const response = await this.apiClient.getTickHistory(symbol, count)

        const latestDigits = response.prices.map((price: number) => {
          const priceStr = price.toFixed(5)
          return Number.parseInt(priceStr[priceStr.length - 1])
        })

        this.tickBuffers.set(symbol, latestDigits)
        console.log(`[v0] Loaded ${latestDigits.length} ticks for ${symbol}`)

        // Wait 1.5 seconds between requests to avoid rate limiting
        await new Promise((r) => setTimeout(r, 1500))
      } catch (error) {
        console.error(`[v0] Error loading history for ${symbol}:`, error)
        // Continue with next symbol even if one fails
      }
    }

    console.log(`[v0] Finished loading tick history for all symbols`)
  }

  async subscribeToMarkets(symbols: string[]): Promise<void> {
    console.log(`[v0] Subscribing to ${symbols.length} markets for live updates...`)

    for (const symbol of symbols) {
      try {
        const subscriptionId = await this.apiClient.subscribeTicks(symbol, (tick: any) => {
          this.handleTickUpdate(symbol, tick.quote)
        })

        this.subscriptions.set(symbol, subscriptionId)
        console.log(`[v0] Subscribed to ${symbol}`)

        // Small delay between subscriptions
        await new Promise((r) => setTimeout(r, 500))
      } catch (error) {
        console.error(`[v0] Error subscribing to ${symbol}:`, error)
      }
    }
  }

  private handleTickUpdate(symbol: string, price: number): void {
    const buffer = this.tickBuffers.get(symbol) || []
    const lastDigit = Number.parseInt(price.toFixed(5).slice(-1))

    buffer.push(lastDigit)

    // Keep only last 100 ticks in rolling buffer
    if (buffer.length > 100) {
      buffer.shift()
    }

    this.tickBuffers.set(symbol, buffer)
  }

  getTickBuffer(symbol: string): number[] {
    return this.tickBuffers.get(symbol) || []
  }

  async cleanup(): Promise<void> {
    console.log("[v0] Cleaning up tick subscriptions...")

    for (const [symbol, subscriptionId] of this.subscriptions.entries()) {
      try {
        await this.apiClient.forget(subscriptionId)
      } catch (error) {
        console.log(`[v0] Error forgetting subscription for ${symbol}:`, error)
      }
    }

    this.subscriptions.clear()
    this.tickBuffers.clear()
  }
}
