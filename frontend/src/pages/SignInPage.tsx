import { useState, type FormEvent } from 'react'
import { AUTH_MODE, supabase } from '../auth/config'
import { Alert } from '../components/Alert'
import { Icon, LogoMark } from '../components/Icon'

const POINTS = [
  { icon: 'key', text: 'Bring your own OpenAI, Anthropic, Gemini or Mistral key. It is encrypted and never shown again.' },
  { icon: 'shield', text: 'Tailor rules, format and behaviour. Your organisation’s safety guardrails stay on.' },
  { icon: 'list', text: 'Every run gets a correlation ID your admin can trace end to end.' },
] as const

interface Props {
  onDevSignIn: (userId: string) => void
  /** Resolves to an error message, or null once signed in. */
  onPasswordSignIn: (email: string, password: string) => Promise<string | null>
}

export function SignInPage({ onDevSignIn, onPasswordSignIn }: Props) {
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
        {AUTH_MODE === 'dev' ? <DevForm onSignIn={onDevSignIn} /> : <PasswordForm onSignIn={onPasswordSignIn} />}
      </main>
    </div>
  )
}

function DevForm({ onSignIn }: { onSignIn: Props['onDevSignIn'] }) {
  const [userId, setUserId] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (userId.trim()) onSignIn(userId.trim())
  }
  return (
    <form className="signin-form" onSubmit={submit}>
      <div className="stack" style={{ gap: 8 }}>
        <h2>Sign in</h2>
        <p className="subtitle">Development sign-in: enter any user ID. Admin tools appear for IDs listed in ADMIN_USERS.</p>
      </div>
      <div className="field">
        <label htmlFor="user-id">User ID</label>
        <input id="user-id" className="input" autoComplete="username" placeholder="e.g. priya" value={userId} onChange={(e) => setUserId(e.target.value)} />
      </div>
      <button type="submit" className="btn primary" disabled={!userId.trim()}>
        Sign in
      </button>
    </form>
  )
}

function PasswordForm({ onSignIn }: { onSignIn: Props['onPasswordSignIn'] }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(await onSignIn(email.trim(), password)) // on success the app swaps this page out
    setBusy(false)
  }

  return (
    <form className="signin-form" onSubmit={submit}>
      <div className="stack" style={{ gap: 8 }}>
        <h2>Sign in</h2>
        <p className="subtitle">Use your work account. Admin tools appear automatically if you have the admin role.</p>
      </div>
      {!supabase && (
        <Alert tone="error" title="Sign-in isn’t configured">
          <p>This build is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.</p>
        </Alert>
      )}
      {error && (
        <Alert tone="error">
          <p>{error}</p>
        </Alert>
      )}
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" className="input" type="email" autoComplete="email" placeholder="name@yourorg.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button type="submit" className="btn primary" disabled={busy || !supabase || !email.trim() || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {/* ponytail: no self sign-up or password reset screens; admins create users and reset passwords in Supabase */}
      <p className="small">Accounts are provisioned by your admin. Forgot your password? Ask your admin to reset it.</p>
    </form>
  )
}
