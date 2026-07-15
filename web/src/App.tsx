import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "react-router-dom"
import { AuthProvider } from "@/auth/AuthContext"
import { LoginGate } from "@/auth/LoginGate"
import { useAuth } from "@/auth/context"
import { queryClient } from "@/lib/queryClient"
import { router } from "@/router/routes"
import { useLiveUpdates } from "@/services/api/live"

/** Opens the single live SSE connection while authenticated. */
function LiveUpdates() {
  const { token } = useAuth()
  useLiveUpdates(token)
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LiveUpdates />
        <LoginGate>
          <RouterProvider router={router} />
        </LoginGate>
      </AuthProvider>
    </QueryClientProvider>
  )
}
