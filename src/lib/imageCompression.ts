/**
 * Komprimiert ein Bild-File auf max. MAX_PX Pixel auf der längsten Seite,
 * JPEG-Qualität 0.82 → aus 5 MB werden typischerweise ~250–400 KB.
 */
const MAX_PX = 1600
const QUALITY = 0.82

export async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const { naturalWidth: w, naturalHeight: h } = img

      // Skalierungsfaktor berechnen (nur verkleinern, nie vergrößern)
      const scale = Math.min(1, MAX_PX / Math.max(w, h))
      const tw = Math.round(w * scale)
      const th = Math.round(h * scale)

      const canvas = document.createElement('canvas')
      canvas.width  = tw
      canvas.height = th
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, tw, th)

      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
        'image/jpeg',
        QUALITY
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}
