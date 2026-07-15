import { useCallback, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  AuthContext,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "@/auth/context"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken())

  const login = useCallback((next: string) => {
    setStoredToken(next)
    setToken(next)
  }, [])

  const logout = useCallback(() => {
    clearStoredToken()
    setToken(null)
  }, [])

  const value = useMemo(() => ({ token, login, logout }), [token, login, logout])

  return <AuthContext value={value}>{children}</AuthContext>
}
