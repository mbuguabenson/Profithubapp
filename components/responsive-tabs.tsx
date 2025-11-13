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
  const [selectedTab, setSelectedTab] = useState<string>("smart-analysis")

  const handleTabClick = (tabValue: string) => {
    setSelectedTab(tabValue)
    setIsDropdownOpen(false)
    // Trigger the tab change by dispatching a click event on the actual tab trigger
    const tabTrigger = document.querySelector(`[value="${tabValue}"]`)
    if (tabTrigger) {
      ;(tabTrigger as HTMLElement).click()
    }
  }

  const getTabLabel = (value: string) => {
    let label = value.replace(/-/g, " ")
    const child = React.Children.toArray(children).find((c) => React.isValidElement(c) && c.props.value === value)
    if (React.isValidElement(child)) {
      const childLabel = child.props.children
      if (typeof childLabel === "string") {
        label = childLabel
      }
    }
    return label
  }

  // On mobile (sm and below), show dropdown. On larger screens, show horizontal tabs
  return (
    <>
      {/* Mobile Dropdown View */}
      <div className="sm:hidden px-2 py-3">
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className={`w-full flex items-center justify-between text-sm font-medium h-11 ${
                theme === "dark"
                  ? "bg-[#0f1629]/80 border-green-500/30 text-white hover:bg-[#1a2235]"
                  : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
              }`}
            >
              <span className="capitalize truncate">{getTabLabel(selectedTab)}</span>
              <ChevronDown className="h-4 w-4 ml-2 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            className={`w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto ${theme === "dark" ? "bg-[#0a0e27] border-green-500/30" : "bg-white border-gray-300"}`}
          >
            {/* Render tab triggers as dropdown items */}
            {React.Children.map(children, (child) => {
              if (React.isValidElement(child)) {
                const tabValue = child.props.value
                const tabLabel = child.props.children
                return (
                  <DropdownMenuItem
                    key={tabValue}
                    onClick={() => handleTabClick(tabValue)}
                    className={`cursor-pointer py-3 ${
                      selectedTab === tabValue
                        ? theme === "dark"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-green-100 text-green-700"
                        : ""
                    }`}
                  >
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
