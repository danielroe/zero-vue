import { describe, expect, it } from 'vitest'
import { relativeImport, renderOptionsTemplate, renderTypesTemplate } from '../src/nuxt-templates'

describe('relativeImport', () => {
  it('should strip the extension and force an explicit relative specifier', () => {
    expect(relativeImport('/app/.nuxt/zero', '/app/zero.config.ts')).toBe('../../zero.config')
    expect(relativeImport('/app/.nuxt/zero', '/app/.nuxt/zero/zero.config.mts')).toBe('./zero.config')
  })
})

describe('renderOptionsTemplate', () => {
  it('should escape the config path so windows separators survive', () => {
    const contents = renderOptionsTemplate(String.raw`C:\app\zero.config.ts`, false)
    expect(contents).toContain(String.raw`export { default } from "C:\\app\\zero.config.ts"`)
    expect(contents).toContain('export const ssr = false')
  })

  it('should expose the ssr flag', () => {
    expect(renderOptionsTemplate('/app/zero.config.ts', true)).toContain('export const ssr = true')
  })
})

describe('renderTypesTemplate', () => {
  it('should declare the composables module against the user config', () => {
    const contents = renderTypesTemplate('../../zero.config')
    expect(contents).toContain(`declare module 'zero-vue/nuxt/composables'`)
    expect(contents).toContain(`typeof import('../../zero.config')['default']`)
  })
})
