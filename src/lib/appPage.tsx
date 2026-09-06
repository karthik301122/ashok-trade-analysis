import { createContext, useContext } from 'react'

export type AppPage =
  | 'sector'
  | 'breadth'
  | 'alerts'
  | 'special-patterns'
  | 'create-pattern'
  | 'profile'

type AppNavContextValue = {
  page: AppPage
  setPage: (page: AppPage) => void
}

export const AppNavContext = createContext<AppNavContextValue | null>(null)

export function useAppNav(): AppNavContextValue {
  const ctx = useContext(AppNavContext)
  if (!ctx) {
    throw new Error('useAppNav must be used within AppNavContext')
  }
  return ctx
}
