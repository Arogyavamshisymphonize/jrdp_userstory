import { useState } from 'react'
import { api, ApiError } from '../api/client'
import type { BasePrompt } from '../api/types'
import { Alert, ErrorAlert } from '../components/Alert'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../context/session'
import { useApi } from '../hooks/useApi'

export function AdminBasePage() {
  const base = useApi<BasePrompt>('/admin/base-prompt')
  const [notice, setNotice] = useState<string | null>(null)
  if (base.error) return <ErrorAlert error={base.error} />
  if (!base.data) return <p className="small">Loading…</p>
  return (
    <>
      {notice && (
        <Alert tone="success">
          <p>{notice}</p>
        </Alert>
      )}
      <BaseEditor
        key={base.data.version}
        base={base.data}
        onPublished={(text) => {
          setNotice(text)
          base.reload()
        }}
      />
    </>
  )
}

function BaseEditor({ base, onPublished }: { base: BasePrompt; onPublished: (text: string) => void }) {
  const { reloadMe } = useSession()
  const original = Object.fromEntries(base.protected.map((n) => [n, base.sections[n]]))
  const [edits, setEdits] = useState(original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const dirty = base.protected.some((n) => edits[n] !== original[n])
  const editable = Object.keys(base.sections).filter((n) => !base.protected.includes(n))

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ base_version: number }>('PUT', '/admin/base-prompt', { sections: edits })
      reloadMe()
      onPublished(`Published as v${r.base_version}. Users whose patch no longer fits are flagged and use the base prompt until they save again.`)
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Base prompt"
        subtitle="Applied with every user’s patch. Users can’t see or change these sections."
        adminOnly
        actions={
          <button type="button" className="btn primary" disabled={!dirty || busy} onClick={publish}>
            {busy ? 'Publishing…' : `Publish v${base.version + 1}`}
          </button>
        }
      />
      {error && <ErrorAlert error={error} title="Not published" />}

      <div className="grid-2">
        <div className="card" style={{ gap: 4, padding: '16px 18px' }}>
          <span className="small">Live version</span>
          <span style={{ fontSize: 20, fontWeight: 600 }}>v{base.version}</span>
          <span className="small">
            {base.published_at && `Published ${new Date(base.published_at).toLocaleDateString([], { dateStyle: 'medium' })}`}
            {base.published_by && ` by ${base.published_by}`}
          </span>
        </div>
        <div className="card" style={{ gap: 4, padding: '16px 18px' }}>
          <span className="small">Users can edit</span>
          <span style={{ fontSize: 20, fontWeight: 600 }}>{editable.length} sections</span>
          <span className="small">{editable.join(', ')}</span>
        </div>
      </div>

      {base.protected.map((name) => {
        const id = `base-${name.toLowerCase().replace(/\W+/g, '-')}`
        const changed = edits[name] !== original[name]
        return (
          <section key={name} className="card" style={{ gap: 10 }}>
            <div className="card-head" style={{ alignItems: 'baseline' }}>
              <label htmlFor={id} style={{ fontSize: 16, fontWeight: 600 }}>
                {name}
              </label>
              <span className="small" style={changed ? { color: 'var(--accent-ink)', fontWeight: 500 } : undefined}>
                {changed ? 'Edited' : `Unchanged since v${base.version}`}
              </span>
            </div>
            <textarea id={id} className="textarea mono" rows={6} value={edits[name]} onChange={(e) => setEdits({ ...edits, [name]: e.target.value })} />
          </section>
        )
      })}
    </>
  )
}
