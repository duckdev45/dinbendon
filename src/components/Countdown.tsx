import { useEffect, useState } from 'react'
import { formatDeadline, timeLeft } from '../lib/time'

/** 截止時間 + 倒數；剩不到一小時會變紅色 */
export function Countdown({ deadline, onClose }: { deadline: string; onClose?: () => void }) {
  const [now, setNow] = useState(Date.now())
  const left = timeLeft(deadline, now)
  const closed = now >= new Date(deadline).getTime()

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (closed) onClose?.()
  }, [closed, onClose])

  const leftTone = closed ? 'bg-soy-soft text-rice' : left.urgent ? 'animate-glow bg-stamp text-rice' : 'bg-soy text-yolk'
  return (
    <div className="inline-flex flex-wrap items-stretch overflow-hidden rounded-tile border-3 border-soy bg-rice shadow-pop-sm max-md:flex max-md:w-full max-md:flex-col max-md:text-center">
      <span className="px-3.5 py-1.5">{formatDeadline(deadline)} 截止</span>
      <span className={`px-3.5 py-1.5 font-num font-semibold tabular-nums ${leftTone}`}>{closed ? '已截止' : `還剩 ${left.text}`}</span>
    </div>
  )
}
