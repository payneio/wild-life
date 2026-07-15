import { useEffect, useState, type ReactNode } from "react"
import { apiClient } from "@/services/api/client"
import { cn } from "@/lib/utils"

/** Renders a bearer-protected image by fetching it as a Blob and object-URL'ing it. */
export function AuthedImage({
  path,
  alt,
  className,
  fallback,
}: {
  path: string
  alt: string
  className?: string
  fallback: ReactNode
}) {
  // Keyed by path so a path change derives back to the fallback (no effect setState).
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null)
  const [failedPath, setFailedPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    apiClient
      .getBlob(path)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setLoaded({ path, url: objectUrl })
      })
      .catch(() => {
        if (!cancelled) setFailedPath(path)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  const url = loaded?.path === path ? loaded.url : null
  if (failedPath === path || !url) return <>{fallback}</>
  return <img src={url} alt={alt} className={className} />
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-12 w-12 text-sm", lg: "h-20 w-20 text-xl" }

/** Avatar: photo if the person has one, else an initials circle. */
export function Avatar({
  name,
  photoUrl,
  size = "md",
  className,
}: {
  name: string
  photoUrl?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const box = cn(
    "flex shrink-0 items-center justify-center rounded-full font-semibold",
    SIZES[size],
    className,
  )
  const fallback = (
    <span className={cn(box, "bg-indigo-100 text-indigo-700")}>{initials(name)}</span>
  )
  if (!photoUrl) return fallback
  return (
    <AuthedImage
      path={photoUrl}
      alt={name}
      className={cn(box, "object-cover")}
      fallback={fallback}
    />
  )
}
