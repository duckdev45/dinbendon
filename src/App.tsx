import { useEffect, useState } from 'react'
import { api } from './api'
import { OrderPage } from './pages/OrderPage'
import { AdminPage } from './pages/AdminPage'

// 用 hash 路由，丟到 GitLab Pages / 任何靜態主機都不用設定 rewrite
function useRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash.startsWith('#/admin') ? 'admin' : 'order'
}

export function App() {
  const route = useRoute()
  return (
    <div className="app">
      <header className="topbar">
        <a className="topbar-logo" href="#/">
          甲奔！<small>訂便當</small>
        </a>
        <nav className="topbar-nav">
          {api.mode === 'demo' && (
            <span className="demo-badge" title="還沒設定 VITE_GAS_URL，資料只存在這台電腦的瀏覽器">
              Demo 模式
            </span>
          )}
          {route === 'order' ? <a href="#/admin">負責人後台</a> : <a href="#/">回點餐頁</a>}
        </nav>
      </header>
      {route === 'admin' ? <AdminPage /> : <OrderPage />}
    </div>
  )
}
