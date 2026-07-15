import { useState } from "react"
import { KeyRound } from "lucide-react"
import { useAuth } from "@/auth/context"

export function Login() {
  const { login } = useAuth()
  const [value, setValue] = useState("")

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const token = value.trim()
    if (token) login(token)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white">
            <KeyRound size={22} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Personal</h1>
          <p className="text-sm text-slate-500">
            Enter your API token to continue.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="API token"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
