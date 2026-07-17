import { useEffect, useState } from "react"
import { apiClient } from "@/services/api/client"

const IMG_CLS = "my-2 max-h-96 max-w-full rounded-lg border border-slate-200"

/**
 * Render a bearer-protected note image. `<img src>` can't send the auth header,
 * so we fetch the bytes as a Blob and show an object URL. Retries a few times on
 * 404 to ride out the brief post-upload commit-visibility window.
 */
export function AuthImage({ imageId, alt }: { imageId: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const blob = await apiClient.getBlob(`/note-images/${imageId}`)
          if (cancelled) return
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
          return
        } catch {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
        }
      }
      if (!cancelled) setFailed(true)
    }

    // Reset to the loading placeholder whenever imageId changes (intentional
    // synchronous reset on dep change).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(null)
    setFailed(false)
    load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageId])

  if (failed) return <span className="text-xs text-slate-400">[image unavailable]</span>
  if (!url) return <span className={`${IMG_CLS} inline-block h-40 w-64 animate-pulse bg-slate-100`} />
  return <img src={url} alt={alt ?? ""} className={IMG_CLS} />
}
