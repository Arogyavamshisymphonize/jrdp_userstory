// Thin fetch wrapper for the backend API. Never stores provider keys; only the caller's sign-in.
import { AUTH_MODE, DEV_USER_KEY, supabase } from '../auth/config'

const API = '/api/v1'

export class ApiError extends Error {
  readonly code: string
  readonly correlationId: string | null
  readonly status: number

  constructor(body: { message?: string; code?: string; correlationId?: string | null }, status: number) {
    super(body.message ?? 'Request failed.')
    this.code = body.code ?? `HTTP_${status}`
    this.correlationId = body.correlationId ?? null
    this.status = status
  }
}

/** Who is calling: the dev user id, or the current Supabase access token (supabase-js refreshes it before expiry). */
async function authHeaders(): Promise<Record<string, string>> {
  if (AUTH_MODE === 'dev') {
    const id = sessionStorage.getItem(DEV_USER_KEY)
    return id ? { 'X-User-Id': id } : {}
  }
  const token = (await supabase?.auth.getSession())?.data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = await authHeaders()
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError({ message: 'The backend is not reachable.', code: 'NETWORK_ERROR' }, 0)
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    // e.g. an HTML error page from a proxy in front of the API
    data = { message: 'The service returned an unexpected response.' }
  }
  if (!response.ok) throw new ApiError(data as object, response.status)
  return data as T
}
