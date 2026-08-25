import type { PatternBias } from './patterns/types'

export type CustomPattern = {
  id: string
  name: string
  bias: PatternBias
  description: string
  /** Reuse an existing catalog detector under this custom name */
  basedOn: string | null
  createdAt: number
}

export type PatternPrefs = {
  starredNames: string[]
  customPatterns: CustomPattern[]
}

const EMPTY: PatternPrefs = { starredNames: [], customPatterns: [] }

function storageKey(user: string | null) {
  const who = user?.trim() || 'local'
  return `asx-pattern-prefs:${who}`
}

export function loadPatternPrefs(user: string | null): PatternPrefs {
  try {
    const raw = localStorage.getItem(storageKey(user))
    if (!raw) return { ...EMPTY, starredNames: [], customPatterns: [] }
    const parsed = JSON.parse(raw) as Partial<PatternPrefs>
    return {
      starredNames: Array.isArray(parsed.starredNames)
        ? parsed.starredNames.filter((n): n is string => typeof n === 'string')
        : [],
      customPatterns: Array.isArray(parsed.customPatterns)
        ? parsed.customPatterns.filter(
            (p): p is CustomPattern =>
              p != null &&
              typeof p === 'object' &&
              typeof p.id === 'string' &&
              typeof p.name === 'string',
          )
        : [],
    }
  } catch {
    return { ...EMPTY, starredNames: [], customPatterns: [] }
  }
}

export function savePatternPrefs(user: string | null, prefs: PatternPrefs) {
  localStorage.setItem(storageKey(user), JSON.stringify(prefs))
}

export function toggleStarredName(prefs: PatternPrefs, name: string): PatternPrefs {
  const set = new Set(prefs.starredNames)
  if (set.has(name)) set.delete(name)
  else set.add(name)
  return { ...prefs, starredNames: [...set].sort((a, b) => a.localeCompare(b)) }
}

export function addCustomPattern(
  prefs: PatternPrefs,
  input: { name: string; bias: PatternBias; description: string; basedOn: string | null },
): PatternPrefs {
  const name = input.name.trim()
  if (!name) return prefs
  const custom: CustomPattern = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    bias: input.bias,
    description: input.description.trim(),
    basedOn: input.basedOn?.trim() || null,
    createdAt: Date.now(),
  }
  return { ...prefs, customPatterns: [...prefs.customPatterns, custom] }
}

export function removeCustomPattern(prefs: PatternPrefs, id: string): PatternPrefs {
  const removed = prefs.customPatterns.find((p) => p.id === id)
  const customPatterns = prefs.customPatterns.filter((p) => p.id !== id)
  const starredNames = removed
    ? prefs.starredNames.filter((n) => n !== removed.name)
    : prefs.starredNames
  return { ...prefs, customPatterns, starredNames }
}
