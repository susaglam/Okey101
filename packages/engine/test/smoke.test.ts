import { describe, it, expect } from 'vitest'
import { ENGINE_NAME } from '../src/index'

describe('engine smoke', () => {
  it('exposes a name', () => {
    expect(ENGINE_NAME).toBe('@cs-okey/engine')
  })
})
