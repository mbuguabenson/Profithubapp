"use client"

interface DigitFrequency {
  count: number
  percentage: number
}

interface DigitDistributionProps {
  frequencies: Record<string, DigitFrequency>
  currentDigit: number | null
  theme: "light" | "dark"
}

export function DigitDistribution({ frequencies, currentDigit, theme }: DigitDistributionProps) {
  const digits = Array.from({ length: 10 }, (_, i) => i)

  const sortedDigits = digits
    .map((d) => ({ digit: d, ...frequencies[d] }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.percentage - a.percentage)

  const mostAppearing = sortedDigits[0]?.digit
  const secondMost = sortedDigits[1]?.digit
  const leastAppearing = sortedDigits[sortedDigits.length - 1]?.digit

  const digitColors = [
    "from-purple-500 to-purple-600", // 0
    "from-blue-500 to-blue-600", // 1
    "from-cyan-500 to-cyan-600", // 2
    "from-teal-500 to-teal-600", // 3
    "from-emerald-500 to-emerald-600", // 4
    "from-lime-500 to-lime-600", // 5
    "from-orange-500 to-orange-600", // 6
    "from-orange-600 to-orange-700", // 7
    "from-red-500 to-red-600", // 8
    "from-pink-500 to-pink-600", // 9
  ]

  const getCircleSize = (digit: number) => {
    if (digit === mostAppearing) return "w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24" // Largest
    if (digit === secondMost) return "w-14 h-14 sm:w-18 sm:h-18 md:w-20 md:h-20" // Medium
    return "w-12 h-12 sm:w-16 sm:h-16 md:w-18 md:h-18" // Normal
  }

  const renderDigit = (digit: number) => {
    const freq = frequencies[digit] || { count: 0, percentage: 0 }
    const isActive = currentDigit === digit
    const isMostAppearing = digit === mostAppearing
    const isSecondMost = digit === secondMost
    const isLeastAppearing = digit === leastAppearing

    return (
      <div key={digit} className="flex flex-col items-center space-y-1 sm:space-y-2">
        <div
          className={`${getCircleSize(digit)} rounded-full bg-gradient-to-br ${digitColors[digit]} flex items-center justify-center text-white font-bold text-xl sm:text-2xl md:text-3xl relative transition-all duration-300 ${
            isActive ? "ring-2 sm:ring-4 ring-yellow-400 scale-105 sm:scale-110" : ""
          }`}
        >
          {digit}
          {isActive && (
            <div className="absolute -bottom-2 sm:-bottom-3 left-1/2 -translate-x-1/2">
              <div className="w-0 h-0 border-l-4 sm:border-l-8 border-r-4 sm:border-r-8 border-t-4 sm:border-t-8 border-l-transparent border-r-transparent border-t-orange-500" />
            </div>
          )}
        </div>

        <div className="text-xs sm:text-sm font-semibold text-white">{freq.percentage.toFixed(1)}%</div>

        <div className="flex flex-col items-center space-y-0.5 sm:space-y-1">
          <div className="text-xs text-gray-400">{freq.count}</div>
          <div
            className={`h-0.5 sm:h-1 w-8 sm:w-12 rounded-full ${
              isMostAppearing
                ? "bg-emerald-500"
                : isSecondMost
                  ? "bg-orange-500"
                  : isLeastAppearing
                    ? "bg-red-500"
                    : "bg-blue-500"
            }`}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 p-3 sm:p-4 md:p-6 bg-[#0a0e27] rounded-lg">
      <div className="grid grid-cols-5 gap-2 sm:gap-4 md:gap-6 justify-items-center">
        {digits.slice(0, 5).map(renderDigit)}
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-4 md:gap-6 justify-items-center">
        {digits.slice(5, 10).map(renderDigit)}
      </div>

      <div className="flex items-center justify-center gap-3 sm:gap-4 md:gap-6 pt-3 sm:pt-4 border-t border-gray-700 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-emerald-500" />
          <span className="text-xs text-gray-300">Most Appearing</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-orange-500" />
          <span className="text-xs text-gray-300">2nd Most</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-red-500" />
          <span className="text-xs text-gray-300">Least Appearing</span>
        </div>
      </div>
    </div>
  )
}
