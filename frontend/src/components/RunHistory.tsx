import { Fragment, useEffect, useState } from 'react'
import type { MyRun } from '../api/types'
import { promptLabel } from '../context/session'
import { useApi } from '../hooks/useApi'
import { ErrorAlert } from './Alert'
import { RunStatus } from './Badge'
import { Markdown } from './Markdown'

/** The caller's saved runs (execution_audit), newest first. Re-fetches whenever `refreshKey` changes. */
export function RunHistory({ refreshKey, providerNames }: { refreshKey: number; providerNames: Record<string, string> }) {
  const runs = useApi<MyRun[]>('/users/me/runs')
  const { reload } = runs
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (refreshKey) reload()
  }, [refreshKey, reload])

  if (runs.error) return <ErrorAlert error={runs.error} />
  if (!runs.data?.length) return null
  return (
    <section aria-label="Recent runs" className="card flush">
      <div className="card-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-soft)' }}>
        <h2 style={{ fontSize: 15 }}>Your recent runs</h2>
        <span className="small">Select a run to see its prompt and answer</span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Correlation ID</th>
              <th>Provider · model</th>
              <th>Prompt</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.data.map((r) => {
              const expanded = open === r.correlation_id
              return (
                <Fragment key={`${r.correlation_id}-${r.created_at}`}>
                  <tr>
                    <td>
                      <button type="button" className="btn ghost" style={{ minHeight: 32, padding: 0, fontSize: 14 }} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.correlation_id)}>
                        {new Date(r.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </button>
                    </td>
                    <td className="mono" style={{ fontSize: 13 }}>
                      {r.correlation_id}
                    </td>
                    <td>
                      {providerNames[r.provider_id] ?? r.provider_id} · {r.model_id}
                    </td>
                    <td>{promptLabel(r)}</td>
                    <td>
                      <RunStatus status={r.status} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--ground)' }}>
                        <div className="stack" style={{ gap: 10 }}>
                          <span className="small">Your prompt</span>
                          <pre className="pre" style={{ background: 'var(--surface)' }}>
                            {r.task_text ?? '–'}
                          </pre>
                          <span className="small">Answer</span>
                          {r.response_text ? (
                            <div className="card" style={{ padding: 16 }}>
                              <Markdown>{r.response_text}</Markdown>
                            </div>
                          ) : (
                            <p className="small">{r.status === 'OUTPUT_BLOCKED' ? 'Withheld: it contained protected instructions.' : 'No answer: the run failed.'}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
