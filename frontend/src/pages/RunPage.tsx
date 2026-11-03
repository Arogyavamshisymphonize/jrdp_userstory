import { useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../api/client'
import type { ExecutionResult, Model, ModelPreference, Provider } from '../api/types'
import { Alert, ErrorAlert } from '../components/Alert'
import { RunStatus } from '../components/Badge'
import { Icon } from '../components/Icon'
import { Markdown } from '../components/Markdown'
import { PageHeader } from '../components/PageHeader'
import { promptLabel, useSession } from '../context/session'
import { useApi } from '../hooks/useApi'

export function RunPage() {
  const { me, runs, addRun } = useSession()
  const providers = useApi<Provider[]>('/providers')
  const pref = useApi<ModelPreference>('/users/me/model-preference')
  const connected = (providers.data ?? []).filter((p) => p.key_status === 'Valid')

  const [picked, setPicked] = useState<string | null>(null)
  const pid = picked ?? (connected.some((p) => p.id === pref.data?.provider_id) ? pref.data!.provider_id : connected[0]?.id) ?? null
  const models = useApi<Model[]>(pid ? `/providers/${pid}/models` : null)
  const [freeOnly, setFreeOnly] = useState(false)
  const modelIds = (models.data ?? []).filter((m) => !freeOnly || m.free_tier).map((m) => m.id)
  const [pickedModel, setPickedModel] = useState<string | null>(null)
  const model =
    (pickedModel && modelIds.includes(pickedModel) ? pickedModel : null) ??
    (pref.data?.provider_id === pid && modelIds.includes(pref.data?.model_id ?? '') ? pref.data!.model_id : modelIds[0]) ??
    null

  const [task, setTask] = useState('')
  const [running, setRunning] = useState(false)
  const [settingsError, setSettingsError] = useState<ApiError | null>(null)
  const last = runs[0]

  const run = async () => {
    if (!pid || !model || !task.trim()) return
    setRunning(true)
    setSettingsError(null)
    try {
      if (pid !== pref.data?.provider_id || model !== pref.data?.model_id) {
        await api('PUT', '/users/me/model-preference', { provider_id: pid, model_id: model })
        pref.reload()
      }
    } catch (e) {
      setSettingsError(e as ApiError)
      setRunning(false)
      return
    }
    const base = { at: new Date(), provider: connected.find((p) => p.id === pid)?.name ?? pid, model, promptLabel: promptLabel(me) }
    try {
      addRun({ ...base, result: await api<ExecutionResult>('POST', '/agent/execute', { task }), error: null })
    } catch (e) {
      addRun({ ...base, result: null, error: e as ApiError })
      providers.reload() // a rejected key is marked Invalid by the API; reflect it
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Run prompts"
        subtitle="Runs use your own key. Your organisation’s base prompt is always applied first."
        actions={
          <span className="chip">
            <span style={{ color: 'var(--warn-mark)' }}>
              <Icon name="lock" size={16} />
            </span>
            Base prompt <b>v{me.base_version}</b> (locked)
            <span style={{ color: 'var(--faint)' }}>+</span>
            <Link to="/prompt">{me.patch_version ? `My patch v${me.patch_version}` : 'No personal patch'}</Link>
          </span>
        }
      />
      {me.conflict && (
        <Alert tone="warning" title="Your patch is out of date">
          <p>The base prompt changed and your patch no longer fits, so runs use the base prompt. Save your edits again on My prompt.</p>
        </Alert>
      )}
      {providers.error && <ErrorAlert error={providers.error} />}
      {providers.data && connected.length === 0 && (
        <Alert tone="info" title="Connect an API key to start">
          <p>
            Runs use your own provider key. <Link to="/keys">Go to API keys &amp; models</Link>
          </p>
        </Alert>
      )}

      {connected.length > 0 && (
        <>
          <section aria-label="Run settings" className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
            <div className="field" style={{ flex: '1 1 200px' }}>
              <label htmlFor="provider">Provider</label>
              <select id="provider" className="select" value={pid ?? ''} onChange={(e) => { setPicked(e.target.value); setPickedModel(null) }}>
                {(providers.data ?? []).map((p) => (
                  <option key={p.id} value={p.id} disabled={p.key_status !== 'Valid'}>
                    {p.name} · {p.key_status === 'Valid' ? 'connected' : 'no key'}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: '2 1 260px' }}>
              <label htmlFor="model">
                Model <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(models your key can access)</span>
              </label>
              <select id="model" className="select" value={model ?? ''} disabled={!modelIds.length} onChange={(e) => setPickedModel(e.target.value)}>
                {!modelIds.length && <option>{models.loading ? 'Loading models…' : 'No models available'}</option>}
                {modelIds.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 14 }}>
              <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} style={{ width: 18, height: 18, margin: 0 }} />
              Free-tier models only
            </label>
          </section>
          {models.error && <ErrorAlert error={models.error} />}
          {settingsError && <ErrorAlert error={settingsError} title="Couldn’t switch model" />}

          <div className="row" style={{ alignItems: 'stretch' }}>
            <section aria-label="Prompt" className="card" style={{ flex: '1 1 380px' }}>
              <label htmlFor="task" style={{ fontWeight: 600 }}>
                Your prompt
              </label>
              <textarea
                id="task"
                className="textarea"
                rows={10}
                style={{ flex: 1, minHeight: 240 }}
                value={task}
                placeholder="Describe the task, e.g. summarise these notes for the weekly review."
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && run()}
              />
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <span className="small">Ctrl + Enter to run</span>
                <button type="button" className="btn primary" disabled={running || !task.trim() || !model} onClick={run}>
                  {running ? 'Running…' : 'Run prompt'}
                </button>
              </div>
            </section>

            <section aria-label="Response" className="card" style={{ flex: '1 1 420px' }} aria-live="polite">
              <div className="card-head">
                <h2 style={{ fontSize: 15 }}>Response</h2>
                {last && <span className="code-chip">{last.result?.correlation_id ?? last.error?.correlationId}</span>}
              </div>
              {!last && <p className="small">The answer appears here, in the output format set in your patch.</p>}
              {last?.result && <Delivered result={last.result} />}
              {last?.error?.code === 'OUTPUT_BLOCKED' && <Withheld correlationId={last.error.correlationId} />}
              {last?.error && last.error.code !== 'OUTPUT_BLOCKED' && <ErrorAlert error={last.error} title="The run failed" />}
            </section>
          </div>
        </>
      )}

      {runs.length > 0 && (
        <section aria-label="Recent runs" className="card flush">
          <div className="card-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-soft)' }}>
            <h2 style={{ fontSize: 15 }}>Your recent runs</h2>
            <span className="small">This browser session</span>
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
                {runs.map((r) => (
                  <tr key={r.at.getTime()}>
                    <td>{r.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="mono" style={{ fontSize: 13 }}>
                      {r.result?.correlation_id ?? r.error?.correlationId}
                    </td>
                    <td>
                      {r.provider} · {r.model}
                    </td>
                    <td>{r.promptLabel}</td>
                    <td>
                      <RunStatus status={r.result ? 'SUCCESS' : (r.error?.code ?? 'ERROR')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function Delivered({ result }: { result: ExecutionResult }) {
  return (
    <>
      {result.prompt_conflict && (
        <Alert tone="warning">
          <p>Your prompt patch is out of date; the base prompt was used.</p>
        </Alert>
      )}
      <Markdown>{result.output}</Markdown>
      <div className="actions small" style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--line-soft)', gap: 16 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--ok-mark)' }}>
            <Icon name="check" size={14} />
          </span>
          Passed leak check
        </span>
        <span>
          Tokens {result.tokens_in ?? '–'} in / {result.tokens_out ?? '–'} out
        </span>
        <button type="button" className="btn ghost" style={{ marginLeft: 'auto', minHeight: 32, fontSize: 13 }} onClick={() => navigator.clipboard.writeText(result.output)}>
          Copy
        </button>
      </div>
    </>
  )
}

function Withheld({ correlationId }: { correlationId: string | null }) {
  return (
    <div className="alert warning" role="alert" style={{ flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--warn-mark)' }}>
          <Icon name="shieldAlert" size={20} />
        </span>
        <h3 style={{ fontSize: 16 }}>Response withheld</h3>
      </div>
      <p>
        The model’s answer included parts of your organisation’s protected instructions, so it wasn’t shown. Try rephrasing your prompt. If you think
        this is a mistake, share the correlation ID with your admin.
      </p>
      {correlationId && (
        <div className="actions">
          <button type="button" className="btn small" onClick={() => navigator.clipboard.writeText(correlationId)}>
            Copy correlation ID
          </button>
        </div>
      )}
    </div>
  )
}
