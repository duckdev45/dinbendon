import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
// 字型打包進來，公司內網、Google Fonts 被擋都能正常顯示
import '@fontsource/huninn/400.css'
import '@fontsource/fredoka/latin-500.css'
import '@fontsource/fredoka/latin-600.css'
import '@fontsource/fredoka/latin-700.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
