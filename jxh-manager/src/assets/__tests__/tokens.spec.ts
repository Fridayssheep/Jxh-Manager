import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const baseCss = readFileSync(resolve(process.cwd(), 'src/assets/base.css'), 'utf8')
const mainCss = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')
const metricStrip = readFileSync(resolve(process.cwd(), 'src/components/data/MetricStrip.vue'), 'utf8')
const overviewView = readFileSync(resolve(process.cwd(), 'src/views/overview/OverviewView.vue'), 'utf8')

describe('design tokens', () => {
  it('defines the confirmed coral desk palette and geometry', () => {
    expect(baseCss).toContain('--color-brand-500: #f04464')
    expect(baseCss).toContain('--color-brand-action: #d82f54')
    expect(baseCss).toContain('--color-canvas: #f7f7f5')
    expect(baseCss).toContain('--color-danger: #9f2525')
    expect(baseCss).toContain('--radius-control: 4px')
    expect(baseCss).toContain('--radius-panel: 6px')
    expect(baseCss).toContain('--font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif')
    expect(baseCss).toContain('--font-mono: "IBM Plex Mono", "Noto Sans Mono CJK SC", monospace')
    expect(baseCss).toContain('--space-card: 16px')
  })

  it('uses the shared card tokens for KPI geometry', () => {
    expect(metricStrip).toContain('padding: var(--space-card)')
    expect(metricStrip).toContain('border: 1px solid var(--color-border)')
    expect(metricStrip).toContain('border-radius: var(--radius-panel)')
  })

  it('uses the shared card tokens for overview panels', () => {
    expect(overviewView).toMatch(/\.overview-card\s*\{[^}]*padding: var\(--space-card\)[^}]*}/s)
    expect(overviewView).toMatch(/\.overview-card\s*\{[^}]*border: 1px solid var\(--color-border\)[^}]*}/s)
    expect(overviewView).toMatch(/\.overview-card\s*\{[^}]*border-radius: var\(--radius-panel\)[^}]*}/s)
  })

  it('keeps the app full bleed and honors reduced motion', () => {
    expect(mainCss).toContain('min-height: 100vh')
    expect(mainCss).not.toContain('max-width: 1280px')
    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('keeps filter text and icon actions stable under grid pressure', () => {
    expect(mainCss).toMatch(
      /button\.filter-submit\s*\{[^}]*min-inline-size: 84px[^}]*white-space: nowrap[^}]*}/s,
    )
    expect(mainCss).toMatch(
      /button:is\(\.filter-reset, \.icon-action, \.icon-button\)\s*\{[^}]*display: grid[^}]*inline-size: 38px[^}]*place-items: center[^}]*}/s,
    )
  })
})
