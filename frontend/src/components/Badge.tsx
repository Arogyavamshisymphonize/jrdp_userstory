import type { ReactNode } from 'react'

export type BadgeTone = 'ok' | 'warn' | 'bad' | 'neutral' | 'accent' | 'admin'

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

/** Run / audit status → what the user sees. */
export function RunStatus({ status }: { status: string }) {
  if (status === 'SUCCESS') return <Badge tone="ok">Delivered</Badge>
  if (status === 'OUTPUT_BLOCKED') return <Badge tone="warn">Withheld</Badge>
  return <Badge tone="bad">{status.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>
}
