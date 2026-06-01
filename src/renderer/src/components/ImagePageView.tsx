interface ImagePageViewProps {
  src: string
  width: number // unrotated display width (image natural px)
  height: number
  scale: number
  rotation: number
}

/** Renders an image page, rotated to match the page's user rotation. */
export function ImagePageView({ src, width, height, scale, rotation }: ImagePageViewProps): JSX.Element {
  const w = width * scale
  const h = height * scale
  return (
    <div className="image-page">
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: w,
          height: h,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`
        }}
      />
    </div>
  )
}
