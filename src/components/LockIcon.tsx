/** 喝飲料不揪的小鎖頭：跟歷史訂單的小時鐘同一個畫法，粗框、蛋黃色鎖身；線條顏色跟著文字 */
export function LockIcon({size = 20, className = ''}: { size?: number; className?: string }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 20 20" aria-hidden>
            <path d="M6.5 9 V6.5 a3.5 3.5 0 0 1 7 0 V9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <rect x="3.5" y="8.5" width="13" height="9.5" rx="2.5" fill="var(--color-yolk)" stroke="currentColor" strokeWidth="2"/>
            <circle cx="10" cy="12.6" r="1.6" fill="currentColor"/>
            <path d="M10 13 V15.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
    )
}
