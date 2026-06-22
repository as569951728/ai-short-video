export type ApiMode = 'mock' | 'backend'

export function resolveApiMode(rawMode: unknown): ApiMode {
  return rawMode === 'mock' ? 'mock' : 'backend'
}

export function getApiMode(): ApiMode {
  return resolveApiMode(getViteEnv().VITE_DATA_SOURCE)
}

function getViteEnv() {
  return ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {})
}
