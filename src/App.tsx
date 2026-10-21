import { useEffect, useState } from 'react'
import { OrderPage } from './pages/OrderPage'
import { AdminPage } from './pages/AdminPage'

// 用 hash 路由，丟到任何靜態主機都不用設定 rewrite
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
    <div>
      <header className="mx-auto flex max-w-page items-center justify-end gap-3 px-5 py-3 max-md:px-4 max-md:py-2.5">
        <nav className="flex items-center gap-3 text-md">
          {route === 'order' ? <a href="#/admin">訂單管理</a> : <a href="#/">回點餐頁</a>}
        </nav>
      </header>
      {/* 換了喝飲料不揪連結（#/r/<id>）就整頁重來 */}
      {route === 'admin' ? <AdminPage /> : <OrderPage key={window.location.hash} />}
    </div>
  )
}
