import { useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../api/client'
import type { PatchVersion, SystemPrompt } from '../api/types'
import { Alert } from '../components/Alert'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../context/session'
import { useApi } from '../hooks/useApi'

type Outcome = { saved: SystemPrompt } | { error: ApiError }

export function PromptPage() {
  const { me } = useSession()
  // lives here, not in the editor, so a save message survives the editor's remount
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // remount the editor whenever the effective prompt changes, so the fields start from it
  return <Editor key={`${me.base_version}:${me.patch_version}`} outcome={outcome} setOutcome={setOutcome} />
}

function Editor({ outcome, setOutcome }: { outcome: Outcome | null; setOutcome: (o: Outcome | null) => void }) {
  const { me, reloadMe } = useSession()
  const history = useApi<PatchVersion[]>('/users/me/system-prompt/patches')
  const editable = Object.keys(me.sections).filter((n) => !me.protected_sections.includes(n))
  const original = Object.fromEntries(editable.map((n) => [n, me.sections[n]]))
  const [edits, setEdits] = useState(original)
  const [saving, setSaving] = useState(false)
  const nextVersion = (history.data?.[0]?.version ?? 0) + 1
  const dirty = editable.some((n) => edits[n] !== original[n])

  const save = async () => {
    setSaving(true)
    try {
      const saved = await api<SystemPrompt>('POST', '/users/me/system-prompt/patches', { sections: edits })
      setOutcome({ saved })
      reloadMe() // remounts this editor from the new version
    } catch (e) {
      setOutcome({ error: e as ApiError })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 1100 }}>
      <PageHeader
        title="My prompt"
        subtitle={
          <>
            {me.patch_version ? (
              <>
                Editing from <b style={{ color: 'var(--ink)' }}>v{me.patch_version}</b>
              </>
            ) : (
              'No personal patch yet, editing the defaults'
            )}{' '}
            · base v{me.base_version} · <Link to="/versions">See history</Link>
          </>
        }
        actions={
          <>
            <button type="button" className="btn" disabled={!dirty || saving} onClick={() => { setEdits(original); setOutcome(null) }}>
              Discard changes
            </button>
            <button type="button" className="btn primary" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Validating…' : `Validate & save as v${nextVersion}`}
            </button>
          </>
        }
      />

      {outcome && 'error' in outcome && (
        <Alert tone="error" title="Not saved">
          <p>{outcome.error.message}</p>
          {outcome.error.code === 'UNSAFE_CONTENT' && (
            <p>Patches can add to the protected sections but can’t turn off, override or reveal them. Remove or reword it, then save again.</p>
          )}
        </Alert>
      )}
      {outcome && 'saved' in outcome && (
        <Alert tone="success">
          <p>
            <b>Saved as v{outcome.saved.patch_version}.</b> Validation passed. New runs use base v{outcome.saved.base_version} + patch v
            {outcome.saved.patch_version}.
          </p>
        </Alert>
      )}
      {me.conflict && (
        <Alert tone="warning" title="Your patch no longer applies">
          <p>
            The base prompt was updated and your patch v{me.conflict_patch_version} no longer fits it. The base prompt is in use until you save your edits
            again or reset.
          </p>
        </Alert>
      )}

      <section aria-label="Protected base prompt" className="stack" style={{ gap: 10 }}>
        <h2 className="eyebrow">Base prompt · managed by your organisation</h2>
        <div className="grid-2">
          {me.protected_sections.map((name) => (
            <div key={name} className="locked">
              <span style={{ color: 'var(--muted)' }}>
                <Icon name="lock" />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600 }}>{name}</span>
                <span className="small">{me.is_admin ? 'Locked · edit it under Admin › Base prompt' : 'Locked · content visible to admins only'}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="small">These apply on every run. Your edits can add to them but can’t override them.</p>
      </section>

      <section aria-label="Personal patch" className="stack">
        <h2 className="eyebrow">Your patch · editable</h2>
        {editable.map((name) => {
          const id = `section-${name.toLowerCase().replace(/\W+/g, '-')}`
          const changed = edits[name] !== original[name]
          const rejected = outcome && 'error' in outcome && outcome.error.message.includes(`The ${name} section`)
          return (
            <div key={name} className="card" style={rejected ? { borderColor: '#e58c80' } : undefined}>
              <div className="card-head" style={{ alignItems: 'baseline' }}>
                <label htmlFor={id} style={{ fontSize: 16, fontWeight: 600 }}>
                  {name}
                </label>
                {rejected ? (
                  <span className="small" style={{ color: 'var(--bad-mark)', fontWeight: 600 }}>
                    Conflicts with a protected section
                  </span>
                ) : (
                  <span className="small" style={changed ? { color: 'var(--accent-ink)', fontWeight: 500 } : undefined}>
                    {changed ? 'Edited' : 'Unchanged'}
                  </span>
                )}
              </div>
              <textarea
                id={id}
                className="textarea mono"
                rows={5}
                value={edits[name]}
                aria-invalid={rejected || undefined}
                onChange={(e) => setEdits({ ...edits, [name]: e.target.value })}
              />
            </div>
          )
        })}
      </section>
    </div>
  )
}
