import { useState } from "react"
import { KeyRound } from "lucide-react"
import { useAuth } from "@/auth/context"
import { Button, Input } from "@/components/ui/primitives"

export function Login() {
  const { login } = useAuth()
  const [value, setValue] = useState("")

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const token = value.trim()
    if (token) login(token)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* soft ambient accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl"
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-2xl border border-slate-200/80 bg-surface p-8 shadow-floating"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-on-accent shadow-sm">
            <KeyRound size={22} />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Wild Life</h1>
          <p className="text-sm text-slate-500">Enter your API token to continue.</p>
        </div>
        <Input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="API token"
          className="mb-4 py-2"
        />
        <Button type="submit" className="w-full py-2">
          Sign in
        </Button>
      </form>
    </div>
  )
}
