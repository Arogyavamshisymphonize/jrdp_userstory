import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SignInPage } from './SignInPage'

vi.mock('../auth/config', () => ({ AUTH_MODE: 'supabase', DEV_USER_KEY: 'relay.devUser', supabase: {} }))

describe('SignInPage in supabase mode', () => {
  it('signs in with email and password and shows a rejected sign-in', async () => {
    const onPasswordSignIn = vi.fn().mockResolvedValue('Invalid login credentials')
    render(<SignInPage onDevSignIn={vi.fn()} onPasswordSignIn={onPasswordSignIn} />)
    expect(screen.queryByLabelText('User ID')).toBeNull()

    await userEvent.type(screen.getByLabelText('Work email'), 'priya@org.com')
    await userEvent.type(screen.getByLabelText('Password'), 'hunter22')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onPasswordSignIn).toHaveBeenCalledWith('priya@org.com', 'hunter22')
    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
  })
})
