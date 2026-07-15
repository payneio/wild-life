import { clearStoredToken, getStoredToken } from "@/auth/context"

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9005"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function authHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = getStoredToken()
  if (token) headers["Authorization"] = `Bearer ${token}`
  if (hasBody) headers["Content-Type"] = "application/json"
  return headers
}

async function handle<T>(resp: Response): Promise<T> {
  if (resp.status === 401) {
    clearStoredToken()
    window.location.reload()
    throw new ApiError(401, "Unauthorized")
  }
  if (!resp.ok) {
    throw new ApiError(resp.status, await resp.text())
  }
  if (resp.status === 204) return undefined as T
  return resp.json() as Promise<T>
}

type QueryParams = Record<string, string | string[] | undefined>

function qs(params?: QueryParams): string {
  if (!params) return ""
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) if (item != null && item !== "") sp.append(k, item)
    } else if (v != null && v !== "") {
      sp.append(k, v)
    }
  }
  const out = sp.toString()
  return out ? `?${out}` : ""
}

class ApiClient {
  async get<T>(path: string, params?: QueryParams): Promise<T> {
    const resp = await fetch(`${BASE_URL}${path}${qs(params)}`, {
      headers: authHeaders(false),
    })
    return handle<T>(resp)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: authHeaders(body != null),
      body: body != null ? JSON.stringify(body) : undefined,
    })
    return handle<T>(resp)
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method: "PATCH",
      headers: authHeaders(body != null),
      body: body != null ? JSON.stringify(body) : undefined,
    })
    return handle<T>(resp)
  }

  async delete<T>(path: string): Promise<T> {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: authHeaders(false),
    })
    return handle<T>(resp)
  }

  /** Fetch a bearer-protected binary resource (e.g. a photo) as a Blob. */
  async getBlob(path: string): Promise<Blob> {
    const resp = await fetch(`${BASE_URL}${path}`, { headers: authHeaders(false) })
    if (resp.status === 401) {
      clearStoredToken()
      window.location.reload()
      throw new ApiError(401, "Unauthorized")
    }
    if (!resp.ok) throw new ApiError(resp.status, await resp.text())
    return resp.blob()
  }

  /** Multipart POST — lets the browser set the multipart boundary itself. */
  async postForm<T>(path: string, form: FormData): Promise<T> {
    const headers = authHeaders(false) // no JSON Content-Type
    const resp = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: form,
    })
    return handle<T>(resp)
  }
}

export const apiClient = new ApiClient()
