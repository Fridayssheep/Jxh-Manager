import { describe, expect, it } from 'vitest'

const vueSources = import.meta.glob<string>('../../../**/*.vue', {
  eager: true,
  query: '?raw',
  import: 'default',
})

describe('native select migration', () => {
  it('uses AppSelect for every visible option menu', () => {
    const offenders = Object.entries(vueSources)
      .map(([path, source]) => ({ path, count: source.match(/<select\b/g)?.length ?? 0 }))
      .filter(({ count }) => count > 0)

    expect(offenders).toEqual([])
  })
})
