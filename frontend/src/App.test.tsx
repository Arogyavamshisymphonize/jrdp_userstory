import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('asks the user to sign in before calling the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('User ID'), 'priya')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    // signed in: the app now calls the API, and an unreachable backend shows one clear message
    expect(await screen.findByText('The backend is not reachable.')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(sessionStorage.getItem('relay.auth')).toBe('priya')
  })

  it('shows the navigation once signed in, with admin pages only for admins', async () => {
    sessionStorage.setItem('relay.auth', 'admin')
    const me = { base_version: 1, patch_version: null, conflict: false, conflict_patch_version: null, sections: { Rules: 'r' }, protected_sections: ['Role'], prompt: '', is_admin: true }
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url.endsWith('/system-prompt') ? me : []), { status: 200 }))))
    render(<App />)
    expect(await screen.findByRole('link', { name: /Run prompts/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Audit log/ })).toBeInTheDocument()
    expect(screen.getByText('admin · Admin')).toBeInTheDocument()
  })
})
