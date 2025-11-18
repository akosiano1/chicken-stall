import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Initialize global theme before React renders
const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'chicken-stall' || stored === 'chicken-stall-dark') return stored

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'chicken-stall-dark'
    }
  } catch {
    // ignore
  }
  return 'chicken-stall'
}

const initialTheme = getInitialTheme()
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme)
  document.body?.setAttribute('data-theme', initialTheme)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
