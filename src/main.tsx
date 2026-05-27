import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

// ── Service Worker: Registrierung + Update-Banner ─────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')

      // Auf wartenden SW prüfen (z.B. nach hard reload)
      if (reg.waiting) showUpdateBanner(reg.waiting)

      // Neuer SW wird installiert
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker)
          }
        })
      })

      // Nach SW-Wechsel: Seite neu laden damit neue Version aktiv ist
      let reloading = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloading) { reloading = true; window.location.reload() }
      })
    } catch (e) {
      console.warn('SW registration failed:', e)
    }
  })
}

function showUpdateBanner(worker: ServiceWorker) {
  // Banner bereits vorhanden?
  if (document.getElementById('sw-update-banner')) return

  const banner = document.createElement('div')
  banner.id = 'sw-update-banner'
  banner.style.cssText = [
    'position:fixed', 'bottom:88px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:99999', 'background:#085d68', 'color:#fff',
    'padding:12px 18px', 'border-radius:16px',
    'display:flex', 'align-items:center', 'gap:12px',
    'font-family:Inter,sans-serif', 'font-size:13px', 'font-weight:600',
    'box-shadow:0 4px 24px rgba(8,93,104,0.35)',
    'white-space:nowrap', 'max-width:calc(100vw - 32px)',
  ].join(';')

  banner.innerHTML = `
    <span style="font-size:18px">🔄</span>
    <span>Neue Version verfügbar</span>
    <button id="sw-update-btn" style="
      background:rgba(255,255,255,0.2);border:1.5px solid rgba(255,255,255,0.4);
      color:#fff;padding:6px 14px;border-radius:10px;font-size:13px;font-weight:700;
      cursor:pointer;font-family:inherit;white-space:nowrap;
    ">Jetzt laden</button>
  `
  document.body.appendChild(banner)

  document.getElementById('sw-update-btn')?.addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' })
    banner.remove()
  })

  // Auto-dismiss nach 30s
  setTimeout(() => banner.remove(), 30_000)
}
