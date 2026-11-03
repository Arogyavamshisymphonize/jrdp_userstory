import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import type { ModelPreference, Provider } from '../api/types'
import { Alert, ErrorAlert } from '../components/Alert'
import { Badge } from '../components/Badge'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { useApi } from '../hooks/useApi'

const STATUS = {
  Valid: <Badge tone="ok">Connected</Badge>,
  Invalid: <Badge tone="bad">Key rejected</Badge>,
  'Not Set': <Badge tone="neutral">Not connected</Badge>,
}

export function KeysPage() {
  const providers = useApi<Provider[]>('/providers')
  const pref = useApi<ModelPreference>('/users/me/model-preference')
  const list = providers.data ?? []
  const [chosen, setChosen] = useState<string | null>(null)
  const target = list.find((p) => p.id === chosen) ?? list.find((p) => p.key_status !== 'Valid') ?? null
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const done = (text: string) => {
    setNotice(text)
    setError(null)
    setChosen(null)
    providers.reload()
    pref.reload()
  }

  const remove = async (p: Provider) => {
    if (!window.confirm(`Remove your ${p.name} key? Runs on ${p.name} stop until you add a new one.`)) return
    try {
      await api('DELETE', `/users/me/credentials/${p.id}`)
      done(`${p.name} key removed.`)
    } catch (e) {
      setError(e as ApiError)
    }
  }

  return (
    <>
      <PageHeader
        title="API keys & models"
        subtitle="Connect your own key for each provider. Keys are encrypted with envelope encryption and can never be viewed again after saving, not here and not through the API."
      />
      {notice && (
        <Alert tone="success">
          <p>{notice}</p>
        </Alert>
      )}
      {(providers.error || error) && <ErrorAlert error={(providers.error || error)!} />}

      <div className="row">
        <section aria-label="Providers" className="grid-2" style={{ flex: '3 1 520px', minWidth: 0 }}>
          {list.map((p) => (
            <article key={p.id} className={`card${target?.id === p.id ? ' selected' : ''}`}>
              <div className="card-head">
                <h2>{p.name}</h2>
                {STATUS[p.key_status]}
              </div>
              {p.key_last4 ? (
                <>
                  <div className="key-hidden">
                    <Icon name="lock" size={16} />
                    Key hidden · ends in <span className="mono">{p.key_last4}</span>
                  </div>
                  {pref.data?.provider_id === p.id && <span className="small">Used for runs · {pref.data.model_id}</span>}
                  <div className="actions" style={{ gap: 8 }}>
                    <button type="button" className="btn small" onClick={() => setChosen(p.id)}>
                      Replace key
                    </button>
                    <button type="button" className="btn danger small" onClick={() => remove(p)}>
                      Remove
                    </button>
                  </div>
                </>
              ) : target?.id === p.id ? (
                <p className="small">Connecting: paste your key in the form.</p>
              ) : (
                <>
                  <p className="small">Add a key to run prompts on {p.name} models.</p>
                  <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setChosen(p.id)}>
                    Connect key
                  </button>
                </>
              )}
            </article>
          ))}
        </section>

        {target ? (
          <ConnectForm key={target.id} provider={target} onSaved={() => done(`${target.name} connected. Pick a model on Run prompts.`)} onCancel={() => setChosen(null)} />
        ) : (
          list.length > 0 && (
            <div style={{ flex: '2 1 340px' }}>
              <Alert tone="success">
                <p>Every provider is connected. Use Replace key to change one.</p>
              </Alert>
            </div>
          )
        )}
      </div>
    </>
  )
}

function ConnectForm({ provider, onSaved, onCancel }: { provider: Provider; onSaved: () => void; onCancel: () => void }) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api('PUT', `/users/me/credentials/${provider.id}`, { api_key: key })
      setKey('')
      onSaved()
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setSaving(false)
    }
  }

  const replacing = provider.key_status !== 'Not Set'
  return (
    <form aria-label={`${replacing ? 'Replace' : 'Connect'} ${provider.name}`} className="card" style={{ flex: '2 1 340px', padding: 24, gap: 18 }} onSubmit={submit}>
      <h2 style={{ fontSize: 18 }}>
        {replacing ? 'Replace' : 'Connect'} {provider.name}
      </h2>
      <div className="field">
        <label htmlFor="api-key" style={{ fontSize: 14 }}>
          API key
        </label>
        <input id="api-key" className="input mono" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
        <span className="small">We check the key with the provider before saving it.</span>
      </div>
      <Alert tone="info">
        <p>
          <b>You won’t see this key again.</b> It is encrypted with a unique data key, which is itself encrypted by a key-encryption key. To change it later,
          replace it with a new one.
        </p>
      </Alert>
      {error && <ErrorAlert error={error} title="Nothing was saved" />}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={!key.trim() || saving}>
          {saving ? 'Checking with provider…' : 'Verify & save key'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
