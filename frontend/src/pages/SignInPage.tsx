import { useState, type FormEvent } from 'react'
import { AUTH_MODE } from '../api/client'
import { Icon, LogoMark } from '../components/Icon'

const POINTS = [
  { icon: 'key', text: 'Bring your own OpenAI, Anthropic, Gemini or Mistral key. It is encrypted and never shown again.' },
  { icon: 'shield', text: 'Tailor rules, format and behaviour. Your organisation’s safety guardrails stay on.' },
  { icon: 'list', text: 'Every run gets a correlation ID your admin can trace end to end.' },
] as const

export function SignInPage({ onSignIn }: { onSignIn: (value: string) => void }) {
  const [value, setValue] = useState('')
  const dev = AUTH_MODE === 'dev'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSignIn(value.trim())
  }

  return (
    <div className="signin">
      <section className="signin-hero">
        <div className="brand" style={{ padding: 0, fontSize: 20 }}>
          <LogoMark size={36} />
          Relay
        </div>
        <div className="stack" style={{ gap: 32 }}>
          <h1>One place to run prompts on any model, with your own key.</h1>
          <div className="signin-points">
            {POINTS.map((p) => (
              <div key={p.icon}>
                <span style={{ color: '#9fb1f5' }}>
                  <Icon name={p.icon} size={20} />
                </span>
                <p>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--faint)' }}>Internal tool</p>
      </section>

      <main className="signin-main">
        <form className="signin-form" onSubmit={submit}>
          <div className="stack" style={{ gap: 8 }}>
            <h2>Sign in</h2>
            <p className="subtitle">
              {dev
                ? 'Development sign-in: enter any user ID. Admin tools appear for IDs listed in ADMIN_USERS.'
                : 'Paste an access token from your identity provider. Admin tools appear if you have the admin role.'}
            </p>
          </div>
          {/* ponytail: no OAuth redirect flow; add one (authorization code + PKCE) when this UI is user-facing */}
          <div className="field">
            <label htmlFor="credential">{dev ? 'User ID' : 'Access token'}</label>
            <input
              id="credential"
              className={`input${dev ? '' : ' mono'}`}
              type={dev ? 'text' : 'password'}
              autoComplete={dev ? 'username' : 'off'}
              placeholder={dev ? 'e.g. priya' : ''}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            Sign in
          </button>
          <p className="small">Accounts are provisioned by your admin.</p>
        </form>
      </main>
    </div>
  )
}
