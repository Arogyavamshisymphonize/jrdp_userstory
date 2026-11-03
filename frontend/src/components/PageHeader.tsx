import type { ReactNode } from 'react'
import { Badge } from './Badge'

export function PageHeader({
  title,
  subtitle,
  adminOnly,
  actions,
}: {
  title: string
  subtitle: ReactNode
  adminOnly?: boolean
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {adminOnly && (
          <div>
            <Badge tone="admin">Admin only</Badge>
          </div>
        )}
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  )
}
