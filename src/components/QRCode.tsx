import { useEffect, useRef } from 'react'

interface Props { value: string; size?: number }

export default function QRCode({ value, size = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Simple QR code via API (no library needed)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&color=096a70&bgcolor=ffffff&margin=10`
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        canvas.width = size
        canvas.height = size
        ctx.drawImage(img, 0, 0, size, size)
      }
    }
  }, [value, size])

  return <canvas ref={canvasRef} style={{ width:size, height:size, borderRadius:12 }} />
}
