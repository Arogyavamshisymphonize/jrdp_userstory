// Stroke icons from the design (24×24, currentColor). Decorative unless a label is given.

const PATHS = {
  logo: ['M4 12h10', 'M10 6l6 6-6 6', 'M20 4v16'],
  key: ['circle:8,15,4', 'M11 12l9-9', 'M17 6l3 3'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  shieldAlert: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M12 9v4', 'M12 16h.01'],
  list: ['M4 6h16', 'M4 12h10', 'M4 18h6'],
  lock: ['rect:5,11,14,10,2', 'M8 11V7a4 4 0 0 1 8 0v4'],
  info: ['circle:12,12,9', 'M12 8h.01', 'M11 12h1v5h1'],
  alert: ['circle:12,12,9', 'M12 8v5', 'M12 16h.01'],
  error: ['circle:12,12,9', 'M15 9l-6 6', 'M9 9l6 6'],
  check: ['M5 12l5 5 9-10'],
  play: ['M7 4l13 8-13 8z'],
  edit: ['M4 20h4l11-11-4-4L4 16z', 'M13 7l4 4'],
  history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 7v5l3 3'],
  audit: ['rect:4,3,16,18,2', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {PATHS[name].map((d) => {
        if (d.startsWith('circle:')) {
          const [cx, cy, r] = d.slice(7).split(',')
          return <circle key={d} cx={cx} cy={cy} r={r} />
        }
        if (d.startsWith('rect:')) {
          const [x, y, w, h, rx] = d.slice(5).split(',')
          return <rect key={d} x={x} y={y} width={w} height={h} rx={rx} />
        }
        return <path key={d} d={d} />
      })}
    </svg>
  )
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        background: 'var(--accent)',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <Icon name="logo" size={Math.round(size * 0.57)} />
    </span>
  )
}
