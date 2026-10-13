export type Shaping = { original: string; shaped: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-shaper': { pending: Shaping | null; skipNext: boolean; isOff: boolean }
  }
}
