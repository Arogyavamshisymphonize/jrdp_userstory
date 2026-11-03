import { useState, type FormEvent } from 'react'
import type { AuditRow } from '../api/types'
import { ErrorAlert } from '../components/Alert'
import { RunStatus } from '../components/Badge'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../context/session'
import { useApi } from '../hooks/useApi'

type Tone = '' | 'ok' | 'warn' | 'bad'

function steps(r: AuditRow): { tone: Tone; title: string; detail: string }[] {
  const ok = r.status === 'SUCCESS'
  const blocked = r.status === 'OUTPUT_BLOCKED'
  const out: { tone: Tone; title: string; detail: string }[] = [
    { tone: '', title: 'Request received', detail: `${new Date(r.created_at).toLocaleString()} · ${r.user_id}` + (r.tokens_in ? ` · ${r.tokens_in} input tokens` : '') },
    { tone: '', title: 'Prompt assembled', detail: `Base v${r.base_version}` + (r.patch_version ? ` + patch v${r.patch_version}` : ' · no patch') },
    { tone: ok || blocked ? '' : 'bad', title: 'Provider call', detail: `${r.provider_id} · ${r.model_id} · user’s key · ${r.latency_ms ?? '–'} ms` },
  ]
  if (ok)
    out.push(
      { tone: 'ok', title: 'Leak check: passed', detail: 'No protected text in the response' },
      { tone: 'ok', title: 'Response delivered', detail: `${r.tokens_out ?? '–'} output tokens` },
    )
  else if (blocked)
    out.push(
      { tone: 'warn', title: 'Leak check: flagged', detail: 'Response copied protected base-prompt text' },
      { tone: 'warn', title: 'Response withheld from user', detail: 'User shown the “Response withheld” notice' },
    )
  else out.push({ tone: 'bad', title: 'Run failed', detail: r.status })
  return out
}

export function AuditPage() {
  const { runs } = useSession()
  const latest = runs[0]?.result?.correlation_id ?? runs[0]?.error?.correlationId ?? ''
  const [input, setInput] = useState(latest)
  const [cid, setCid] = useState<string | null>(null)
  const trace = useApi<AuditRow[]>(cid ? `/admin/audit/${encodeURIComponent(cid)}` : null)
  const [raw, setRaw] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setRaw(false)
    setCid(input.trim() || null)
  }
  const rows = trace.data ?? []
  const row = rows[rows.length - 1]

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `trace-${cid}.json` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every run is traceable by its correlation ID. API keys are never logged." adminOnly />
      <form role="search" className="actions" style={{ alignItems: 'flex-end', gap: 12 }} onSubmit={submit}>
        <div className="field" style={{ flex: '2 1 320px' }}>
          <label htmlFor="cid">Correlation ID</label>
          <input id="cid" className="input mono" type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Shown with every response and error" />
        </div>
        <button type="submit" className="btn primary" disabled={!input.trim()}>
          Trace
        </button>
      </form>

      {trace.error && <ErrorAlert error={trace.error} />}
      {row && (
        <div className="row">
          <section aria-label="Events" className="card flush" style={{ flex: '3 1 520px' }}>
            <div className="table-wrap">
              <table style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Event</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleTimeString()}</td>
                      <td>{r.user_id}</td>
                      <td>Run · {r.provider_id}</td>
                      <td>
                        <RunStatus status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-label="Run trace" className="card" style={{ flex: '2 1 360px', gap: 16 }}>
            <div className="stack" style={{ gap: 4 }}>
              <h2 style={{ fontSize: 17 }}>Trace</h2>
              <span className="mono small">{cid}</span>
            </div>
            <ol className="timeline">
              {steps(row).map((s, i, all) => (
                <li key={s.title}>
                  <div className="rail">
                    <span className={`dot ${s.tone}`} />
                    {i < all.length - 1 && <span className="line" />}
                  </div>
                  <div className="step">
                    <strong>{s.title}</strong>
                    <span className="small">{s.detail}</span>
                  </div>
                </li>
              ))}
            </ol>
            {raw && (
              <div className="stack" style={{ gap: 8 }}>
                <span className="small">Task (secrets redacted)</span>
                <pre className="pre">{row.task_text ?? '–'}</pre>
                <span className="small">Response</span>
                <pre className="pre">{row.response_text ?? '–'}</pre>
              </div>
            )}
            <div className="actions" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 16 }}>
              <button type="button" className="btn small" aria-expanded={raw} onClick={() => setRaw(!raw)}>
                {raw ? 'Hide raw request and response' : 'View raw request and response'}
              </button>
              <button type="button" className="btn small" onClick={exportJson}>
                Export JSON
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
