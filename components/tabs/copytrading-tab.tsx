"use client"

import { useDerivAuth } from "@/hooks/use-deriv-auth"
import { DerivAuth } from "@/components/deriv-auth"
import { DERIV_CONFIG } from "@/lib/deriv-config"
import { PlatformLauncher } from "@/components/platform-launcher"
import { Users } from "lucide-react"

interface CopyTradingTabProps {
  theme?: "light" | "dark"
}

export function CopyTradingTab({ theme = "dark" }: CopyTradingTabProps) {
  const { token, isLoggedIn } = useDerivAuth()

  const copytradingUrl = token
    ? `https://app.deriv.com/appstore/traders-hub?app_id=${DERIV_CONFIG.APP_ID}&token1=${token}`
    : `https://app.deriv.com/appstore/traders-hub?app_id=${DERIV_CONFIG.APP_ID}`

  return (
    <div className={`min-h-[80vh] flex flex-col ${theme === "dark" ? "bg-gray-900" : "bg-white"}`}>
      <div className="mb-4">
        <DerivAuth theme={theme} />
      </div>

      <div className="max-w-4xl mx-auto w-full px-4">
        <PlatformLauncher
          title="Copy Trading"
          description="Follow and copy successful traders automatically"
          platformUrl={copytradingUrl}
          isAuthenticated={isLoggedIn}
          icon={<Users className="h-8 w-8" />}
          features={[
            "Browse and follow top-performing traders",
            "Automatic trade replication",
            "View detailed trader statistics and performance",
            "Set custom risk management parameters",
            "Start or stop copying anytime",
          ]}
          theme={theme}
        />
      </div>
    </div>
  )
}
