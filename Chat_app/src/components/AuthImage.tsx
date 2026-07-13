import { useEffect, useState } from 'react'
import { usePhotoBlob } from '../hooks/usePhotoBlob'

interface AuthImageProps {
  photoUrl: string | null | undefined
  alt?: string
  className?: string
  onClick?: () => void
}

// Renders a photo from an AUTH-GATED route: the bytes can't be a plain <img src>
// (the browser won't attach the bearer token), so we fetch the Blob via
// usePhotoBlob and turn it into an object URL here — revoked on unmount/change so
// each mounted image owns its own URL while the Blob stays cached.
function AuthImage({ photoUrl, alt = 'Photo', className, onClick }: AuthImageProps) {
  const { data: blob, isError } = usePhotoBlob(photoUrl)
  const [objectUrl, setObjectUrl] = useState<string>()

  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  if (isError) {
    return <div className={`photo-bubble photo-broken ${className ?? ''}`}>Photo unavailable</div>
  }
  if (!objectUrl) {
    return <div className={`photo-bubble photo-loading ${className ?? ''}`} aria-busy="true" />
  }
  return (
    <img
      src={objectUrl}
      alt={alt}
      className={`photo-bubble ${className ?? ''}`}
      onClick={onClick}
      loading="lazy"
    />
  )
}

export default AuthImage
