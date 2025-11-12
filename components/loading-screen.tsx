"use client"

import { useState, useEffect } from "react"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Loader2 } from "lucide-react"

interface LoadingStep {
  id: string
  label: string
  status: "pending" | "loading" | "complete"
}

interface LoadingScreenProps {
  onComplete: () => void
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<LoadingStep[]>([
    { id: "connect", label: "Connecting to Deriv API", status: "pending" },
    { id: "markets", label: "Initializing market data", status: "pending" },
    { id: "servers", label: "Setting up data from servers", status: "pending" },
    { id: "account", label: "Connecting accounts", status: "pending" },
    { id: "finalize", label: "Finalizing setup", status: "pending" },
  ])

  useEffect(() => {
    const loadingSequence = async () => {
      try {
        console.log("[v0] LoadingScreen: Starting initialization sequence")

        // Step 1: Connect to Deriv API (0-20%)
        setSteps((prev) => prev.map((s, i) => (i === 0 ? { ...s, status: "loading" } : s)))
        await animateProgress(0, 20, 800)
        setSteps((prev) => prev.map((s, i) => (i === 0 ? { ...s, status: "complete" } : s)))

        // Step 2: Initialize market data (20-40%)
        setSteps((prev) => prev.map((s, i) => (i === 1 ? { ...s, status: "loading" } : s)))
        await animateProgress(20, 40, 600)
        setSteps((prev) => prev.map((s, i) => (i === 1 ? { ...s, status: "complete" } : s)))

        // Step 3: Setting up data from servers (40-65%)
        setSteps((prev) => prev.map((s, i) => (i === 2 ? { ...s, status: "loading" } : s)))
        await animateProgress(40, 65, 700)
        setSteps((prev) => prev.map((s, i) => (i === 2 ? { ...s, status: "complete" } : s)))

        // Step 4: Connecting accounts (65-85%)
        setSteps((prev) => prev.map((s, i) => (i === 3 ? { ...s, status: "loading" } : s)))
        await animateProgress(65, 85, 600)
        setSteps((prev) => prev.map((s, i) => (i === 3 ? { ...s, status: "complete" } : s)))

        // Step 5: Finalizing setup (85-100%)
        setSteps((prev) => prev.map((s, i) => (i === 4 ? { ...s, status: "loading" } : s)))
        await animateProgress(85, 100, 500)
        setSteps((prev) => prev.map((s, i) => (i === 4 ? { ...s, status: "complete" } : s)))

        // Wait a moment to show completion
        await new Promise((resolve) => setTimeout(resolve, 500))
        console.log("[v0] LoadingScreen: Initialization complete, calling onComplete")
        onComplete()
      } catch (err) {
        console.error("[v0] LoadingScreen: Initialization error:", err)
        setError(err instanceof Error ? err.message : "Failed to initialize application")
      }
    }

    loadingSequence()
  }, [onComplete])

  const animateProgress = (from: number, to: number, duration: number) => {
    return new Promise<void>((resolve) => {
      const steps = 20
      const increment = (to - from) / steps
      const delay = duration / steps
      let current = from

      const interval = setInterval(() => {
        current += increment
        if (current >= to) {
          setProgress(to)
          clearInterval(interval)
          resolve()
        } else {
          setProgress(Math.round(current))
        }
      }, delay)
    })
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#0a0e27] via-[#0f1629] to-[#1a1f3a]">
        <div className="w-full max-w-md px-6">
          <div className="bg-gradient-to-br from-red-900/50 to-red-950/50 border border-red-500/30 rounded-xl p-8 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-white mb-3">Initialization Failed</h2>
              <p className="text-red-200 text-sm">{error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors shadow-lg"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#0a0e27] via-[#0f1629] to-[#1a1f3a]">
      <div className="w-full max-w-xl px-6">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-4">
            <div
              className="text-6xl font-bold animate-pulse"
              style={{
                filter: "drop-shadow(0 0 30px rgba(16, 185, 129, 0.6))",
              }}
            >
              💰
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent animate-pulse">
            Profit Hub
          </h1>
          <p className="text-gray-400 text-lg mb-1">
            Smart Analysis tools, High accuracy strategies, Signals, Advanced Trading Engines, Automation
          </p>
          <p className="text-gray-500 text-sm">Setting up your trading environment...</p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-3 mb-8">
          <div className="relative">
            <Progress value={progress} className="h-4 bg-gray-700/50" />
            <div
              className="absolute inset-0 h-4 bg-gradient-to-r from-green-500 via-emerald-400 to-teal-400 rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(34,197,94,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center">
            <span className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              {progress}%
            </span>
          </div>
        </div>

        {/* Loading Steps */}
        <div className="bg-gradient-to-br from-[#0f1629]/80 to-[#1a2235]/80 border border-green-500/20 rounded-xl p-6 shadow-[0_0_30px_rgba(34,197,94,0.2)] mb-6">
          <h3 className="text-lg font-bold text-white mb-4">Initialization Progress</h3>
          <div className="space-y-3">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  step.status === "loading"
                    ? "bg-green-500/10 border border-green-500/30"
                    : step.status === "complete"
                      ? "bg-green-500/5 border border-green-500/20"
                      : "bg-gray-800/30 border border-gray-700/30"
                }`}
              >
                <div className="flex-shrink-0">
                  {step.status === "complete" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : step.status === "loading" ? (
                    <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-600" />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      step.status === "loading"
                        ? "text-green-400"
                        : step.status === "complete"
                          ? "text-gray-400"
                          : "text-gray-500"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
                {step.status === "loading" && (
                  <div className="flex-shrink-0">
                    <span className="text-xs text-green-400 font-semibold animate-pulse">Loading...</span>
                  </div>
                )}
                {step.status === "complete" && (
                  <div className="flex-shrink-0">
                    <span className="text-xs text-green-400 font-semibold">✓</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-gradient-to-br from-[#0f1629]/60 to-[#1a2235]/60 border border-blue-500/20 rounded-xl p-5 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
          <h3 className="text-base font-bold text-white mb-3 text-center">Contact & Support</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex flex-col items-center sm:items-start">
              <span className="text-gray-400 mb-1">Email</span>
              <span className="text-cyan-400 font-medium text-xs">mbuguabenson2020@gmail.com</span>
            </div>
            <div className="flex flex-col items-center sm:items-end">
              <span className="text-gray-400 mb-1">WhatsApp</span>
              <span className="text-cyan-400 font-medium">+254757722344</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-700/50 text-center">
            <span className="text-emerald-400 font-medium text-sm">24/7 Support Available</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 text-center">
          <p className="text-xs text-gray-500">© 2025 Profit Hub. All rights reserved.</p>
          <p className="text-xs text-gray-600 mt-1">Trading involves risk. Use signals responsibly.</p>
        </div>
      </div>
    </div>
  )
}
