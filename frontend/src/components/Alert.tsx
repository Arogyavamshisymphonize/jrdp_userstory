import type { ReactNode } from 'react'
import type { ApiError } from '../api/client'
import { Icon, type IconName } from './Icon'

type Tone = 'info' | 'success' | 'warning' | 'error'
const ICON: Record<Tone, IconName> = { info: 'info', success: 'check', warning: 'alert', error: 'error' }

export function Alert({ tone, title, children }: { tone: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ICON[tone]} size={20} />
      <div className="alert-body">
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  )
}

/** An API error as the user sees it: the API's message plus its code and correlation id for support. */
export function ErrorAlert({ error, title }: { error: ApiError; title?: ReactNode }) {
  return (
    <Alert tone="error" title={title}>
      <p>{error.message}</p>
      {error.status > 0 && (
        <span className="ref">
          {error.code}
          {error.correlationId && ` · ref ${error.correlationId}`}
        </span>
      )}
    </Alert>
  )
}
