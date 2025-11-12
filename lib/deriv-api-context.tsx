"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState, useRef } from "react"
import { DerivAPIClient } from "./deriv-api"
import { DERIV_APP_ID } from "./deriv-config"
import { useDerivAuth } from "@/hooks/use-deriv-auth"

interface DerivAPIContextType {
  apiClient: DerivAPIClient | null
  isConnected: boolean
  isAuthorized: boolean
  error: string | null
  connectionStatus: "disconnected" | "connecting" | "connected" | "reconnecting"
}

const DerivAPIContext = createContext<DerivAPIContextType>({
  apiClient: null,
  isConnected: false,
  isAuthorized: false,
  error: null,
  connectionStatus: "disconnected",
})

let globalAPIClient: DerivAPIClient | null = null

export function DerivAPIProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "reconnecting"
  >("disconnected")
  const clientRef = useRef<DerivAPIClient | null>(null)
  const initAttemptRef = useRef(0)
  const { token, isLoggedIn } = useDerivAuth()

  useEffect(() => {
    if (token && isLoggedIn && token.length > 10) {
      if (!globalAPIClient) {
        console.log("[v0] Initializing DerivAPIClient with token")
        globalAPIClient = new DerivAPIClient({ appId: DERIV_APP_ID.toString(), token })
        globalAPIClient.setErrorCallback((err) => {
          console.error("[v0] API Error:", err)
          setError(err.message || "API Error")
        })

        const attemptConnection = async () => {
          try {
            initAttemptRef.current++
            console.log(`[v0] Connection attempt ${initAttemptRef.current}`)
            setConnectionStatus("connecting")

            await globalAPIClient!.connect()
            console.log("[v0] WebSocket connected, attempting authorization...")

            await globalAPIClient!.authorize(token)
            console.log("[v0] Authorization successful")

            setIsConnected(true)
            setIsAuthorized(true)
            setConnectionStatus("connected")
            setError(null)
            initAttemptRef.current = 0
          } catch (err: any) {
            console.error("[v0] Connection/Authorization failed:", err)
            setConnectionStatus("reconnecting")

            // <CHANGE> Increased max reconnection attempts from 5 to 10 and improved backoff strategy
            if (initAttemptRef.current < 10) {
              const delay = Math.min(1000 * Math.pow(1.5, initAttemptRef.current), 15000)
              console.log(`[v0] Reconnecting in ${delay}ms...`)
              setTimeout(attemptConnection, delay)
            } else {
              console.error("[v0] Max connection attempts reached")
              setError("Failed to connect to API after 10 attempts. Please check your API token.")
              setConnectionStatus("disconnected")
            }
          }
        }

        attemptConnection()
      }
    }

    clientRef.current = globalAPIClient

    // <CHANGE> Reduced health check interval from 500ms to 250ms for faster detection
    const interval = setInterval(() => {
      if (clientRef.current) {
        const connected = clientRef.current.isConnected()
        const authorized = clientRef.current.isAuth()

        setIsConnected(connected)
        setIsAuthorized(authorized)

        if (connected && authorized && error) {
          setError(null)
          setConnectionStatus("connected")
        } else if (!connected) {
          setConnectionStatus("disconnected")
        }
      }
    }, 250)

    return () => {
      clearInterval(interval)
    }
  }, [token, isLoggedIn])

  return (
    <DerivAPIContext.Provider
      value={{
        apiClient: clientRef.current,
        isConnected,
        isAuthorized,
        error,
        connectionStatus,
      }}
    >
      {children}
    </DerivAPIContext.Provider>
  )
}

export function useDerivAPI() {
  const context = useContext(DerivAPIContext)
  if (!context) {
    throw new Error("useDerivAPI must be used within DerivAPIProvider")
  }
  return context
}
