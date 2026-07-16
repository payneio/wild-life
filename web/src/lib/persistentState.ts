import { useCallback, useState } from "react"

const PREFIX = "personal_view:"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    // ignore — private mode / disabled storage / bad JSON
    return fallback
  }
}

/**
 * `useState` that persists to localStorage under `personal_view:<key>`. Pass a
 * `null` key to disable persistence (behaves like plain `useState`) — this keeps
 * hook order stable for callers that only sometimes have a storage key.
 */
export function usePersistentState<T>(
  key: string | null,
  initial: T,
): readonly [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (key ? read(key, initial) : initial))

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next
        if (key) {
          try {
            localStorage.setItem(PREFIX + key, JSON.stringify(resolved))
          } catch {
            // ignore — private mode / disabled storage
          }
        }
        return resolved
      })
    },
    [key],
  )

  return [value, set] as const
}
