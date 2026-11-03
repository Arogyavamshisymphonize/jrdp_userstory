// Thin fetch wrapper for the backend API. Never stores provider keys; only the caller's sign-in.

const API = '/api/v1'
const STORAGE_KEY = 'relay.auth'

/** "dev": the API trusts an X-User-Id header (AUTH_MODE=dev). "oidc": a bearer access token. */
export const AUTH_MODE: 'dev' | 'oidc' = import.meta.env.VITE_AUTH_MODE === 'oidc' ? 'oidc' : 'dev'

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

export function getCredential(): string | null {
  return sessionStorage.getItem(STORAGE_KEY)
}

export function setCredential(value: string | null) {
  if (value) sessionStorage.setItem(STORAGE_KEY, value)
  else sessionStorage.removeItem(STORAGE_KEY)
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const credential = getCredential()
  if (credential) {
    if (AUTH_MODE === 'dev') headers['X-User-Id'] = credential
    else headers.Authorization = `Bearer ${credential}`
  }
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
