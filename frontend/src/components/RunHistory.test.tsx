import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MyRun } from '../api/types'
import { RunHistory } from './RunHistory'

const run = (over: Partial<MyRun>): MyRun => ({
  created_at: '2026-11-03T10:00:00Z', correlation_id: 'cid-1', user_id: 'u', provider_id: 'gemini', model_id: 'gemini-2.5-flash',
  base_version: 4, patch_version: 2, status: 'SUCCESS', tokens_in: 10, tokens_out: 5, latency_ms: 900,
  task_text: 'Summarise the notes', response_text: '**Summary.** All good.', ...over,
})

describe('RunHistory', () => {
  it('lists saved runs from the API and shows a run’s prompt and answer', async () => {
    const runs = [run({}), run({ correlation_id: 'cid-2', status: 'OUTPUT_BLOCKED', response_text: null })]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(runs), { status: 200 })))
    render(<RunHistory refreshKey={0} providerNames={{ gemini: 'Google (Gemini)' }} />)

    expect(await screen.findByText('cid-1')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/users/me/runs')
    expect(screen.getAllByText('Google (Gemini) · gemini-2.5-flash')).toHaveLength(2)
    expect(screen.getByText('Withheld')).toBeInTheDocument()

    const [first, second] = screen.getAllByRole('button', { expanded: false })
    await userEvent.click(first)
    expect(screen.getByText('Summarise the notes')).toBeInTheDocument()
    expect(screen.getByText('Summary.').tagName).toBe('STRONG') // the answer renders as Markdown
    await userEvent.click(second)
    expect(screen.getByText('Withheld: it contained protected instructions.')).toBeInTheDocument()
  })
})
