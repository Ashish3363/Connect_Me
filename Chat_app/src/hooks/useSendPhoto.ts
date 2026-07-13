import { useMutation } from '@tanstack/react-query'

// Wrap a photo upload in a mutation, exposing isPending/error for the composer.
// On success the WebSocket broadcast delivers the rendered message to every
// client (including the sender), so there's no cache to write here — same as how
// a text send round-trips through the socket.
export function useSendPhoto(uploader: (file: File) => Promise<unknown>) {
  return useMutation({
    mutationFn: (file: File) => uploader(file),
  })
}
