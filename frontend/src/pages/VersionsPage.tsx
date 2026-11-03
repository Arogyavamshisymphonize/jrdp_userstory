import { useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../api/client'
import type { PatchVersion } from '../api/types'
import { Alert, ErrorAlert } from '../components/Alert'
import { Badge } from '../components/Badge'
import { Diff } from '../components/Diff'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../context/session'
import { useApi } from '../hooks/useApi'

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export function VersionsPage() {
  const { reloadMe } = useSession()
  const history = useApi<PatchVersion[]>('/users/me/system-prompt/patches')
  const versions = history.data ?? []
  const current = versions.find((v) => v.is_active)?.version ?? null
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const a = from ?? versions[1]?.version ?? versions[0]?.version ?? null
  const b = to ?? versions[0]?.version ?? null
  const [view, setView] = useState<'unified' | 'split'>('unified')
  const diff = useApi<{ diff: string }>(a !== null && b !== null && view === 'unified' ? `/users/me/system-prompt/patches/diff?a=${a}&b=${b}` : null)
  const [message, setMessage] = useState<{ tone: 'success'; text: string } | { tone: 'error'; error: ApiError } | null>(null)
  const [busy, setBusy] = useState(false)

  const act = async (method: string, path: string, done: (r: { patch_version: number | null }) => string) => {
    setBusy(true)
    try {
      const r = await api<{ patch_version: number | null }>(method, path)
      setMessage({ tone: 'success', text: done(r) })
      setFrom(null)
      setTo(null)
      history.reload()
      reloadMe()
    } catch (e) {
      setMessage({ tone: 'error', error: e as ApiError })
    } finally {
      setBusy(false)
    }
  }

  const byVersion = (v: number | null) => versions.find((x) => x.version === v)

  return (
    <>
      <PageHeader title="Version history" subtitle="Every save of your patch is a new version. Reverting creates a new version too, so nothing is lost." />
      {message?.tone === 'success' && (
        <Alert tone="success">
          <p>{message.text}</p>
        </Alert>
      )}
      {message?.tone === 'error' && <ErrorAlert error={message.error} title="Not reverted" />}
      {history.error && <ErrorAlert error={history.error} />}
      {history.data && !versions.length && (
        <Alert tone="info" title="No saved versions yet">
          <p>
            Save your first edit on <Link to="/prompt">My prompt</Link>.
          </p>
        </Alert>
      )}

      {versions.length > 0 && (
        <div className="row">
          <section aria-label="Versions" className="card flush" style={{ flex: '1 1 280px' }}>
            <ol className="version-list">
              {versions.map((v) => (
                <li key={v.version}>
                  <button type="button" aria-current={v.version === a} onClick={() => setFrom(v.version)}>
                    <span className="card-head" style={{ width: '100%' }}>
                      <span style={{ fontWeight: 600 }}>v{v.version}</span>
                      {v.is_active ? <Badge tone="accent">Current</Badge> : v.version === a && <span className="small" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Comparing</span>}
                    </span>
                    <span className="small">
                      {when(v.created_at)} · {Object.keys(v.sections).join(', ') || 'no edits'}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div style={{ padding: '14px 18px' }}>
              <button
                type="button"
                className="btn danger small"
                disabled={busy || current === null}
                onClick={() => window.confirm('Stop using a personal patch? Your saved versions stay here.') && act('DELETE', '/users/me/system-prompt/patches', () => 'Reset: new runs use the base prompt only.')}
              >
                Reset to base prompt
              </button>
            </div>
          </section>

          <section aria-label="Diff" className="card flush" style={{ flex: '3 1 520px' }}>
            <div className="actions" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-soft)', justifyContent: 'space-between' }}>
              <div className="actions">
                <label htmlFor="from" className="label">
                  Compare
                </label>
                <select id="from" className="select" style={{ height: 40 }} value={a ?? ''} onChange={(e) => setFrom(Number(e.target.value))}>
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
                <label htmlFor="to" className="label">
                  with
                </label>
                <select id="to" className="select" style={{ height: 40 }} value={b ?? ''} onChange={(e) => setTo(Number(e.target.value))}>
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version}
                      {v.version === current ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="segmented" role="group" aria-label="Diff view">
                <button type="button" className="btn" aria-pressed={view === 'unified'} onClick={() => setView('unified')}>
                  Unified
                </button>
                <button type="button" className="btn" aria-pressed={view === 'split'} onClick={() => setView('split')}>
                  Side by side
                </button>
              </div>
            </div>

            <div style={{ padding: '16px 20px' }}>
              {view === 'unified' ? (
                diff.error ? <ErrorAlert error={diff.error} /> : <Diff text={diff.data?.diff ?? ''} />
              ) : (
                <div className="grid-2">
                  {[a, b].map((v, i) => (
                    <div key={i} className="stack" style={{ gap: 8 }}>
                      <strong>v{v}</strong>
                      {Object.entries(byVersion(v)?.sections ?? {}).map(([name, text]) => (
                        <div key={name} className="stack" style={{ gap: 4 }}>
                          <span className="small">{name}</span>
                          <pre className="pre">{text}</pre>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-foot" style={{ marginTop: 'auto' }}>
              <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                {a === current ? (
                  `v${a} is your current version.`
                ) : (
                  <>
                    Reverting to v{a} saves its content as <b>v{(versions[0]?.version ?? 0) + 1}</b>. It is re-validated first.
                  </>
                )}
              </p>
              <button
                type="button"
                className="btn primary"
                disabled={busy || a === null || a === current}
                onClick={() => act('POST', `/users/me/system-prompt/patches/${a}/revert`, (r) => `Reverted: v${a} saved as v${r.patch_version}.`)}
              >
                Revert to v{a}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
