import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const baseCss = readFileSync(resolve(process.cwd(), 'src/assets/base.css'), 'utf8')
const mainCss = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

describe('design tokens', () => {
  it('defines the confirmed coral desk palette and geometry', () => {
    expect(baseCss).toContain('--color-brand-500: #f04464')
    expect(baseCss).toContain('--color-brand-action: #d82f54')
    expect(baseCss).toContain('--color-canvas: #f7f7f5')
    expect(baseCss).toContain('--color-danger: #9f2525')
    expect(baseCss).toContain('--radius-control: 4px')
    expect(baseCss).toContain('--radius-panel: 6px')
    expect(baseCss).toContain('--font-ui: "IBM Plex Sans", "Noto Sans SC", sans-serif')
  })

  it('keeps the app full bleed and honors reduced motion', () => {
    expect(mainCss).toContain('min-height: 100vh')
    expect(mainCss).not.toContain('max-width: 1280px')
    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
