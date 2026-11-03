import { describe, expect, it, vi } from 'vitest'
import { api, ApiError, setCredential } from './client'

const respond = (status: number, body: string, type = 'application/json') =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } })))

describe('api', () => {
  it('sends the dev user id and returns JSON', async () => {
    respond(200, '[{"id":"openai"}]')
    setCredential('priya')
    await expect(api('GET', '/providers')).resolves.toEqual([{ id: 'openai' }])
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v1/providers')
    expect(init!.headers).toMatchObject({ 'X-User-Id': 'priya' })
  })

  it("surfaces the API's error message, code and correlation id", async () => {
    respond(400, '{"code":"UNSAFE_CONTENT","message":"The Rules section can\'t be saved.","correlationId":"abc-12345"}')
    const err = await api('POST', '/x', {}).catch((e: ApiError) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'UNSAFE_CONTENT', correlationId: 'abc-12345', status: 400 })
  })

  it('turns a non-JSON error page into a readable message', async () => {
    respond(502, '<html><h1>502 Bad Gateway</h1></html>', 'text/html')
    await expect(api('GET', '/x')).rejects.toMatchObject({ message: 'The service returned an unexpected response.', code: 'HTTP_502' })
  })

  it('reports an unreachable backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api('GET', '/x')).rejects.toMatchObject({ message: 'The backend is not reachable.', status: 0 })
  })
})
