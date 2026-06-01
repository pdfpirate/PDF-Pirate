function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Build a data URL + natural dimensions for an image given its bytes. */
export async function loadImageMeta(
  bytes: Uint8Array,
  ext: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  const mime = ext.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg'
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
  const dataUrl = await blobToDataUrl(new Blob([buffer], { type: mime }))
  const img = await loadImg(dataUrl)
  return { dataUrl, width: img.naturalWidth, height: img.naturalHeight }
}

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg']
export const isImageExt = (ext: string): boolean => IMAGE_EXTS.includes(ext.toLowerCase())
