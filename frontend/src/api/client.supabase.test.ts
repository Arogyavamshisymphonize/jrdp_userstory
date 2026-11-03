import { describe, expect, it, vi } from 'vitest'
import { api } from './client'

// Supabase mode: the API gets the current session's access token, never a user id header.
vi.mock('../auth/config', () => ({
  AUTH_MODE: 'supabase',
  DEV_USER_KEY: 'relay.devUser',
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt-abc' } } }) } },
}))

describe('api in supabase mode', () => {
  it('sends the Supabase access token as a bearer token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    sessionStorage.setItem('relay.devUser', 'ignored')
    await api('GET', '/providers')
    const headers = vi.mocked(fetch).mock.calls[0][1]!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer jwt-abc')
    expect(headers['X-User-Id']).toBeUndefined()
  })
})
