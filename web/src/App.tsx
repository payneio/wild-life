import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "react-router-dom"
import { AuthProvider } from "@/auth/AuthContext"
import { LoginGate } from "@/auth/LoginGate"
import { queryClient } from "@/lib/queryClient"
import { router } from "@/router/routes"

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LoginGate>
          <RouterProvider router={router} />
        </LoginGate>
      </AuthProvider>
    </QueryClientProvider>
  )
}
