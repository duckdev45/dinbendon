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

  return (
    <div className={`countdown ${left.urgent ? 'countdown--urgent' : ''} ${closed ? 'countdown--closed' : ''}`}>
      <span className="countdown-when">{formatDeadline(deadline)} 截止</span>
      <span className="countdown-left">{closed ? '已截止' : `還剩 ${left.text}`}</span>
    </div>
  )
}
