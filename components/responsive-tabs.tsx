"use client"

import React from "react"

import { useState } from "react"
import { TabsList } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface ResponsiveTabsProps {
  children: React.ReactNode
  theme?: "light" | "dark"
}

export function ResponsiveTabs({ children, theme = "dark" }: ResponsiveTabsProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // On mobile (sm and below), show dropdown. On larger screens, show horizontal tabs
  return (
    <>
      {/* Mobile Dropdown View */}
      <div className="sm:hidden px-2 py-2">
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className={`w-full flex items-center justify-between ${
                theme === "dark"
                  ? "bg-[#0f1629]/50 border-green-500/30 text-white hover:bg-[#1a2235]"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
            >
              <span>Select Tab</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className={`w-56 ${theme === "dark" ? "bg-[#0a0e27] border-green-500/30" : "bg-white border-gray-300"}`}
          >
            {/* Render tab triggers as dropdown items */}
            {React.Children.map(children, (child) => {
              if (React.isValidElement(child)) {
                const tabValue = child.props.value
                const tabLabel = child.props.children
                return (
                  <DropdownMenuItem key={tabValue} className="cursor-pointer">
                    {tabLabel}
                  </DropdownMenuItem>
                )
              }
              return null
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop Horizontal View */}
      <TabsList
        className={`hidden sm:flex w-full justify-start bg-transparent border-0 h-auto p-0 gap-0 overflow-x-auto flex-nowrap scrollbar-thin scrollbar-thumb-green-500/50 scrollbar-track-transparent ${
          theme === "dark" ? "border-green-500/20" : "border-gray-200"
        }`}
      >
        {children}
      </TabsList>
    </>
  )
}
