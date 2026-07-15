import type { ReactNode } from "react"
import { useAuth } from "@/auth/context"
import { Login } from "@/auth/Login"

export function LoginGate({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Login />
  return <>{children}</>
}
