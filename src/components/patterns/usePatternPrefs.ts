import { useContext } from 'react'
import { PatternPrefsContext } from './patternPrefsCtx'

export function usePatternPrefs() {
  const ctx = useContext(PatternPrefsContext)
  if (!ctx) throw new Error('usePatternPrefs requires PatternPrefsProvider')
  return ctx
}
