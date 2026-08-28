import { useContext } from 'react'
import { PatternPrefsContext } from './patternPrefsContext'

export function usePatternPrefs() {
  const ctx = useContext(PatternPrefsContext)
  if (!ctx) throw new Error('usePatternPrefs requires PatternPrefsProvider')
  return ctx
}
