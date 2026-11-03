import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('renders headings, lists, tables and code from a model answer', () => {
    render(<Markdown>{'**Summary.** Done.\n\n## Points\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n`x = 1`'}</Markdown>)
    expect(screen.getByText('Summary.').tagName).toBe('STRONG')
    expect(screen.getByRole('heading', { name: 'Points' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('x = 1').tagName).toBe('CODE')
  })

  it('does not render raw HTML and opens links safely', () => {
    const { container } = render(<Markdown>{'<img src=x onerror="alert(1)"> [docs](https://example.com)'}</Markdown>)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
