export type Suggestion = string

declare module 'claude-code' {
  interface PluginState {
    'next-buttons': { options: Suggestion[]; guess: Suggestion | null }
  }
}
