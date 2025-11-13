"use client"

import { useDerivAuth } from "@/hooks/use-deriv-auth"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ApprovalModal } from "@/components/approval-modal"
import { ApiTokenModal } from "@/components/api-token-modal"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { User, Settings, LogIn, LogOut, UserPlus } from "lucide-react"

interface DerivAuthProps {
  theme?: "light" | "dark"
}

export function DerivAuth({ theme = "dark" }: DerivAuthProps) {
  const {
    isLoggedIn,
    showApprovalModal,
    handleApproval,
    cancelApproval,
    requestLogin,
    logout,
    balance,
    accountType,
    accountCode,
    accounts,
    switchAccount,
    activeLoginId,
    showTokenModal,
    submitApiToken,
    openTokenSettings,
  } = useDerivAuth()

  const openDerivAccount = () => {
    window.open("https://app.deriv.com/account", "_blank", "noopener,noreferrer")
  }

  const createDerivAccount = () => {
    window.open("https://track.deriv.com/_1mHiO0UpCX6NhxmBqQyZL2Nd7ZgqdRLk/1/", "_blank", "noopener,noreferrer")
  }

  return (
    <>
      <ApprovalModal open={showApprovalModal} onApprove={handleApproval} onCancel={cancelApproval} />
      <ApiTokenModal open={showTokenModal} onSubmit={submitApiToken} theme={theme} />

      {!isLoggedIn && (
        <div className="flex items-center gap-2">
          <Button
            onClick={createDerivAccount}
            size="sm"
            className={`text-xs sm:text-sm ${
              theme === "dark"
                ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white"
                : "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
            }`}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Create Account
          </Button>
          <Button
            onClick={requestLogin}
            size="sm"
            className={`text-xs sm:text-sm ${
              theme === "dark" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            <LogIn className="h-4 w-4 mr-1" />
            Login
          </Button>
        </div>
      )}

      {isLoggedIn && (
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div
            className={`flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md border ${
              theme === "dark"
                ? "bg-gray-800/50 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                : "bg-gray-100 border-gray-300"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`text-xs sm:text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Type:
              </span>
              {accountType && (
                <Badge
                  className={
                    accountType === "Real"
                      ? "bg-green-600 text-white hover:bg-green-700 text-xs sm:text-sm h-5"
                      : "bg-yellow-500 text-black hover:bg-yellow-600 text-xs sm:text-sm h-5"
                  }
                >
                  {accountType}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className={`text-xs sm:text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Account:
              </span>
              <span
                className={`text-xs sm:text-sm font-mono font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}
              >
                {accountCode}
              </span>
            </div>

            {balance && (
              <div className="flex items-center gap-1.5">
                <span className={`text-xs sm:text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Balance:
                </span>
                <span
                  className={`text-xs sm:text-sm font-semibold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}
                >
                  {balance.amount.toFixed(2)} {balance.currency}
                </span>
              </div>
            )}

            {accounts.length > 1 && (
              <Select value={activeLoginId || ""} onValueChange={switchAccount}>
                <SelectTrigger
                  className={`w-24 sm:w-32 h-7 text-xs sm:text-sm ${theme === "dark" ? "bg-gray-700 text-white border-blue-500/30" : "bg-white text-gray-900"}`}
                >
                  <SelectValue placeholder="Switch" />
                </SelectTrigger>
                <SelectContent className={theme === "dark" ? "bg-gray-800 text-white" : "bg-white text-gray-900"}>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id} className="text-xs sm:text-sm">
                      {acc.id} ({acc.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={openTokenSettings}
            className={`h-9 w-9 ${
              theme === "dark"
                ? "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
            }`}
            title="Change API Token"
          >
            <Settings className="h-5 w-5" />
          </Button>

          <Avatar
            className="cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all w-9 h-9"
            onClick={openDerivAccount}
            title="Open Deriv Account"
          >
            <AvatarImage
              src={`https://ui-avatars.com/api/?name=${activeLoginId || "User"}&background=3b82f6&color=fff`}
            />
            <AvatarFallback>
              <User size={16} />
            </AvatarFallback>
          </Avatar>

          <Button onClick={logout} size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm h-9">
            <LogOut className="h-4 w-4 mr-1" />
            Logout
          </Button>
        </div>
      )}
    </>
  )
}
