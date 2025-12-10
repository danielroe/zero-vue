import antfu from '@antfu/eslint-config'

export default antfu().overrideRules({ 'pnpm/yaml-enforce-settings': ['error', {
  settings: {
    shellEmulator: true,
    trustPolicy: 'no-downgrade',
  },
}] })
