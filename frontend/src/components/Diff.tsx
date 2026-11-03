/** A unified diff (as the API returns it) with added/removed lines coloured. */
export function Diff({ text }: { text: string }) {
  if (!text) return <p className="small">No differences.</p>
  const lines = text.replace(/\n$/, '').split('\n')
  return (
    <pre className="diff" aria-label="Differences">
      {lines.map((line, i) => {
        const kind = line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@') ? 'hunk'
          : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : ''
        return (
          <div key={i} className={kind}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}
