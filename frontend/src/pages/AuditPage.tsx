import { useState, type FormEvent } from 'react'
import type { AuditRow, RunSummary } from '../api/types'
import { ErrorAlert } from '../components/Alert'
import { RunStatus } from '../components/Badge'
import { Markdown } from '../components/Markdown'
import { PageHeader } from '../components/PageHeader'
import { promptLabel } from '../context/session'
import { useApi } from '../hooks/useApi'

type Tone = '' | 'ok' | 'warn' | 'bad'

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'SUCCESS', label: 'Delivered' },
  { value: 'OUTPUT_BLOCKED', label: 'Withheld' },
  { value: 'INVALID_KEY', label: 'Key rejected' },
  { value: 'PROVIDER_UNAVAILABLE', label: 'Provider unavailable' },
  { value: 'RATE_LIMITED', label: 'Rate limited' },
  { value: 'QUOTA_EXCEEDED', label: 'Quota exceeded' },
]

function steps(r: AuditRow): { tone: Tone; title: string; detail: string }[] {
  const ok = r.status === 'SUCCESS'
  const blocked = r.status === 'OUTPUT_BLOCKED'
  const out: { tone: Tone; title: string; detail: string }[] = [
    { tone: '', title: 'Request received', detail: `${new Date(r.created_at).toLocaleString()} · ${r.user_id}` + (r.tokens_in ? ` · ${r.tokens_in} input tokens` : '') },
    { tone: '', title: 'Prompt assembled', detail: promptLabel(r) },
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
  const [userFilter, setUserFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [applied, setApplied] = useState({ user: '', status: '' })
  const query = new URLSearchParams({ limit: '100', ...(applied.user && { user_id: applied.user }), ...(applied.status && { status: applied.status }) })
  const list = useApi<RunSummary[]>(`/admin/audit?${query}`)

  const [cidInput, setCidInput] = useState('')
  const [cid, setCid] = useState<string | null>(null)

  const filter = (e: FormEvent) => {
    e.preventDefault()
    setApplied({ user: userFilter.trim(), status: statusFilter })
  }
  const lookup = (e: FormEvent) => {
    e.preventDefault()
    setCid(cidInput.trim() || null)
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every run is saved with its correlation ID, prompt versions, task and answer. API keys are never logged."
        adminOnly
        actions={
          <button type="button" className="btn" onClick={list.reload} disabled={list.loading}>
            Refresh
          </button>
        }
      />

      <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
        <form role="search" aria-label="Filter runs" className="actions" style={{ alignItems: 'flex-end', gap: 12, flex: '3 1 480px' }} onSubmit={filter}>
          <div className="field" style={{ flex: '2 1 220px' }}>
            <label htmlFor="usr">User</label>
            <input id="usr" className="input" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} placeholder="Anyone (user id / Supabase UID)" />
          </div>
          <div className="field" style={{ flex: '1 1 160px' }}>
            <label htmlFor="st">Status</label>
            <select id="st" className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn">
            Filter
          </button>
        </form>
        <form role="search" aria-label="Find a run" className="actions" style={{ alignItems: 'flex-end', gap: 12, flex: '2 1 320px' }} onSubmit={lookup}>
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="cid">Correlation ID</label>
            <input id="cid" className="input mono" type="search" value={cidInput} onChange={(e) => setCidInput(e.target.value)} placeholder="From a response or error" />
          </div>
          <button type="submit" className="btn primary" disabled={!cidInput.trim()}>
            Trace
          </button>
        </form>
      </div>

      <div className="row">
        <section aria-label="Runs" className="card flush" style={{ flex: '3 1 520px' }}>
          {list.error && <ErrorAlert error={list.error} />}
          {list.data && !list.data.length && <p className="small" style={{ padding: 20 }}>No runs match.</p>}
          {!!list.data?.length && (
            <div className="table-wrap">
              <table style={{ minWidth: 620 }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Correlation ID</th>
                    <th>User</th>
                    <th>Event</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((r) => {
                    const selected = r.correlation_id === cid
                    return (
                      <tr key={`${r.correlation_id}-${r.created_at}`} style={selected ? { background: 'var(--accent-wash)', boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}>
                        <td>{new Date(r.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}</td>
                        <td>
                          <button
                            type="button"
                            className="btn ghost mono"
                            style={{ minHeight: 32, padding: 0, fontSize: 13, fontWeight: selected ? 600 : 400 }}
                            aria-pressed={selected}
                            onClick={() => {
                              setCid(r.correlation_id)
                              setCidInput(r.correlation_id)
                            }}
                          >
                            {r.correlation_id}
                          </button>
                        </td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.user_id}>
                          {r.user_id}
                        </td>
                        <td>
                          Run · {r.provider_id} · {r.model_id}
                        </td>
                        <td>
                          <RunStatus status={r.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Trace key={cid ?? ''} cid={cid} />
      </div>
    </>
  )
}

function Trace({ cid }: { cid: string | null }) {
  const trace = useApi<AuditRow[]>(cid ? `/admin/audit/${encodeURIComponent(cid)}` : null)
  const [raw, setRaw] = useState(false)
  const rows = trace.data ?? []
  const row = rows[rows.length - 1]

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `trace-${cid}.json` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <section aria-label="Run trace" className="card" style={{ flex: '2 1 360px', gap: 16 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 style={{ fontSize: 17 }}>Trace</h2>
        {cid ? <span className="mono small">{cid}</span> : <span className="small">Select a run, or look one up by correlation ID.</span>}
      </div>
      {trace.error && <ErrorAlert error={trace.error} />}
      {row && (
        <>
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
              <span className="small">Response{row.status === 'OUTPUT_BLOCKED' && ' (withheld from the user)'}</span>
              {row.response_text ? (
                <div className="card" style={{ padding: 16, background: 'var(--ground)' }}>
                  <Markdown>{row.response_text}</Markdown>
                </div>
              ) : (
                <pre className="pre">–</pre>
              )}
            </div>
          )}
          <div className="actions" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 16 }}>
            <button type="button" className="btn small" aria-expanded={raw} onClick={() => setRaw(!raw)}>
              {raw ? 'Hide request and response' : 'View request and response'}
            </button>
            <button type="button" className="btn small" onClick={exportJson}>
              Export JSON
            </button>
          </div>
        </>
      )}
    </section>
  )
}
