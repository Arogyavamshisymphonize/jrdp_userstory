import { NavLink, Outlet } from 'react-router'
import { useSession } from '../context/session'
import { Icon, LogoMark, type IconName } from './Icon'

function Item({ to, icon, children }: { to: string; icon: IconName; children: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <Icon name={icon} />
      {children}
    </NavLink>
  )
}

export function Layout() {
  const { user, me, signOut } = useSession()
  const name = user.label
  return (
    <div className="shell">
      <nav aria-label="Main" className="sidebar">
        <div className="brand">
          <LogoMark />
          Relay
        </div>
        <Item to="/run" icon="play">Run prompts</Item>
        <Item to="/prompt" icon="edit">My prompt</Item>
        <Item to="/versions" icon="history">Version history</Item>
        <Item to="/keys" icon="key">API keys &amp; models</Item>
        {me.is_admin && (
          <>
            <p className="nav-heading">Admin</p>
            <Item to="/admin/base-prompt" icon="shield">Base prompt</Item>
            <Item to="/admin/audit" icon="audit">Audit log</Item>
          </>
        )}
        <div className="account">
          <div className={`avatar${me.is_admin ? ' admin' : ''}`} aria-hidden="true">
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
              {me.is_admin && ' · Admin'}
            </span>
            <button type="button" className="btn ghost" style={{ minHeight: 0, padding: 0, fontSize: 13 }} onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
