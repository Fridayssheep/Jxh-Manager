// @vitest-environment node

import { describe, expect, it } from 'vitest'

import viteConfig from '../../../vite.config'

describe('Vite development server', () => {
  it('proxies the same-origin admin API to the backend admin listener', () => {
    expect(viteConfig).toMatchObject({
      server: {
        proxy: {
          '/api/admin/v1': {
            target: 'http://127.0.0.1:8090',
          },
        },
      },
    })
  })
})
