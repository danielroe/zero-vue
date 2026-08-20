// Node 25+ exposes localStorage through a warning-producing getter unless a
// storage file is configured. Unit tests use in-memory Zero clients, so model
// an environment without browser storage instead.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: undefined,
  writable: true,
})
