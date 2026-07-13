import { useQuery } from '@tanstack/react-query'
import { fetchPhotoBlob } from '../services/photos'

// Fetch a photo's bytes (auth-gated) and cache the Blob per token so scrollbacks
// and re-renders don't re-download. The object URL itself is made/revoked by the
// consuming component (AuthImage) so caching the blob stays safe to share.
export function usePhotoBlob(photoUrl: string | null | undefined) {
  return useQuery({
    queryKey: ['photo', photoUrl],
    queryFn: () => fetchPhotoBlob(photoUrl as string),
    enabled: !!photoUrl,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 min — well within the 24 h photo lifetime
  })
}
