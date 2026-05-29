import { useEffect, useRef, useState } from 'react'

interface Props {
  address: string
  city: string
  postalCode?: string
}

export default function MapView({ address, city, postalCode }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [status, setStatus] = useState<'loading'|'ok'|'error'>('loading')

  const fullAddress = `${address}, ${postalCode || ''} ${city}`.trim()
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
  const osmUrl  = `https://www.openstreetmap.org/search?query=${encodeURIComponent(fullAddress)}`

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const container = mapRef.current

    const init = async () => {
      // Load Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id = 'leaflet-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      const L = await import('leaflet')
      delete (L.Icon.Default.prototype as any)._getIconUrl

      if (!container || mapInstanceRef.current) return

      // Geocode via Nominatim with proper headers
      let lat = 51.3167, lon = 9.4981
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddress)}&format=json&limit=1&countrycodes=de`,
          {
            signal: controller.signal,
            headers: {
              'User-Agent': 'SteuberWork-PWA/1.0',
              'Accept-Language': 'de',
            }
          }
        )
        clearTimeout(timeout)
        const data = await res.json()
        if (data?.[0]) {
          lat = parseFloat(data[0].lat)
          lon = parseFloat(data[0].lon)
        }
      } catch(e) {
        console.warn('Geocoding failed, using fallback coords:', e)
      }

      if (!container || mapInstanceRef.current) return

      const map = L.map(container, {
        center: [lat, lon],
        zoom: 16,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false,
      })

      // Use multiple tile providers as fallback
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        crossOrigin: true,
      }).addTo(map)

      // Custom teal marker
      const icon = L.divIcon({
        html: `<div style="
          width:32px;height:32px;
          border-radius:50% 50% 50% 0;
          background:#096a70;
          transform:rotate(-45deg);
          border:3px solid #fff;
          box-shadow:0 3px 10px rgba(9,106,112,0.5)
        "></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        className: '',
      })

      L.marker([lat, lon], { icon })
        .addTo(map)
        .bindPopup(`<b>${address}</b><br>${postalCode || ''} ${city}`)

      mapInstanceRef.current = map
      setStatus('ok')
    }

    init().catch(e => { console.error(e); setStatus('error') })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [fullAddress])

  return (
    <div style={{ borderRadius:16, overflow:'hidden', border:'1px solid var(--outline)', boxShadow:'0 2px 12px rgba(9,106,112,0.06)' }}>
      {/* Map container */}
      <div style={{ position:'relative', height:200, background:'#e8f4f5' }}>
        <div ref={mapRef} style={{ width:'100%', height:'100%' }} />
        {status === 'loading' && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, background:'#e8f4f5' }}>
            <span className="material-symbols-outlined" style={{ color:'var(--pri)', fontSize:32 }}>map</span>
            <span style={{ fontSize:12, color:'var(--txt-muted)' }}>Karte wird geladen...</span>
          </div>
        )}
        {status === 'error' && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, background:'#e8f4f5' }}>
            <span className="material-symbols-outlined" style={{ color:'var(--txt-muted)', fontSize:32 }}>map_off</span>
            <span style={{ fontSize:12, color:'var(--txt-muted)' }}>Karte nicht verfügbar</span>
          </div>
        )}
      </div>

      {/* Address bar */}
      <div style={{ background:'var(--surf-card)', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700 }}>{address}</div>
          <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>{postalCode} {city}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href={osmUrl} target="_blank" rel="noopener noreferrer"
            style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', padding:'7px 12px', borderRadius:999, whiteSpace:'nowrap' }}>
            <span className="material-symbols-outlined" style={{ fontSize:14 }}>map</span>OSM
          </a>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', padding:'7px 12px', borderRadius:999, whiteSpace:'nowrap' }}>
            <span className="material-symbols-outlined" style={{ fontSize:14 }}>directions</span>Maps
          </a>
        </div>
      </div>
    </div>
  )
}
