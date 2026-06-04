import { useState } from 'react'

interface Props {
  address: string
  city: string
  postalCode?: string
}

export default function MapView({ address, city, postalCode }: Props) {
  const [showDialog, setShowDialog] = useState(false)

  const fullAddress = [address, postalCode, city].filter(Boolean).join(', ')
  const encodedAddress = encodeURIComponent(fullAddress)

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

  const openAppleMaps = () => {
    window.open(`maps://maps.apple.com/?q=${encodedAddress}`, '_blank')
    setShowDialog(false)
  }

  const openGoogleMaps = () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank')
    setShowDialog(false)
  }

  return (
    <>
      <div style={{ borderRadius:16, overflow:'hidden', border:'1px solid var(--outline)', boxShadow:'0 2px 12px rgba(9,106,112,0.06)' }}>
        {/* Karten-Vorschau via Google Maps iframe */}
        <div style={{ position:'relative', height:180 }}>
          <iframe
            title="Kartenvorschau"
            src={`https://maps.google.com/maps?q=${encodedAddress}&output=embed&hl=de&z=15`}
            style={{ width:'100%', height:'100%', border:'none', display:'block' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        {/* Adresszeile + Route-Button */}
        <div style={{ background:'var(--surf-card)', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{address}</div>
            <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>{postalCode} {city}</div>
          </div>
          <button
            onClick={() => isIOS ? setShowDialog(true) : openGoogleMaps()}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', borderRadius:12, border:'none', background:'var(--pri)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
            <span className="material-symbols-outlined" style={{ fontSize:16 }}>directions</span>
            Route
          </button>
        </div>
      </div>

      {/* App-Auswahl Dialog (iOS) */}
      {showDialog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:2000, display:'flex', alignItems:'flex-end' }}
          onClick={() => setShowDialog(false)}>
          <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', width:'100%', paddingBottom:'env(safe-area-inset-bottom, 20px)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 6px' }}>
              <div style={{ width:36, height:4, borderRadius:2, background:'var(--surf-high)' }}/>
            </div>
            <div style={{ padding:'4px 20px 10px', fontSize:13, color:'var(--txt-muted)', textAlign:'center' }}>{fullAddress}</div>
            <div style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:10 }}>
              <button onClick={openAppleMaps}
                style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, border:'1px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', width:'100%' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'#e8f5ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:20, color:'#007aff' }}>map</span>
                </div>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>Apple Maps</div>
                  <div style={{ fontSize:11, color:'var(--txt-muted)' }}>In Apple Maps öffnen</div>
                </div>
              </button>
              <button onClick={openGoogleMaps}
                style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, border:'1px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', width:'100%' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'#fff3e0', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:20, color:'#ea4335' }}>location_on</span>
                </div>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>Google Maps</div>
                  <div style={{ fontSize:11, color:'var(--txt-muted)' }}>In Google Maps öffnen</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
