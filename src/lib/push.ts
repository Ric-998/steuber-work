import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = 'BIVxcSSeFZEXfg82j5-GQR6x4nOZxgiFVaPbRxkBarjj8oP2y7auEww2-aWuj_PpOcBuXXzrBbqU_D8eNqTEZik'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const hadController = !!navigator.serviceWorker.controller
    const reg = await navigator.serviceWorker.register('/sw.js')

    // Stündlich auf Updates prüfen (für lang laufende PWA-Sessions)
    setInterval(() => reg.update(), 60 * 60 * 1000)

    // Wenn ein neuer SW die Kontrolle übernimmt:
    // - Erststart (kein vorheriger Controller) → still, kein Banner nötig
    // - Update (vorheriger Controller war aktiv) → Banner anzeigen
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return
      window.dispatchEvent(new CustomEvent('swupdated'))
    })

    return reg
  } catch(e) {
    console.warn('SW registration failed:', e)
    return null
  }
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!('PushManager' in window)) return false

  try {
    const reg = await navigator.serviceWorker.ready
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const { endpoint, keys } = subscription.toJSON() as any

    // Save to Supabase
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    }, { onConflict: 'user_id,endpoint' })

    return !error
  } catch(e) {
    console.warn('Push subscription failed:', e)
    return false
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await sub.unsubscribe()
      await supabase.from('push_subscriptions').delete()
        .eq('user_id', userId)
        .eq('endpoint', sub.endpoint)
    }
  } catch(e) {
    console.warn('Unsubscribe failed:', e)
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch { return false }
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}
