import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type TradingMode = 'live' | 'paper'

const STORAGE_KEY = 'tradersscope.tradingMode'

type PaperSummary = {
  cash: number
  equity: number
  totalPnl: number
  totalPnlPct: number
}

type TradingModeContextValue = {
  mode: TradingMode
  setMode: (mode: TradingMode) => void
  isPaper: boolean
  paperSummary: PaperSummary | null
  refreshPaperSummary: () => Promise<void>
  lastPaperToast: string | null
  setPaperToast: (msg: string | null) => void
}

const TradingModeContext = createContext<TradingModeContextValue | null>(null)

function readStoredMode(): TradingMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'paper' || raw === 'live') return raw
  } catch {
    /* ignore */
  }
  return 'live'
}

type ProviderProps = {
  user: string | null
  children: ReactNode
}

export function TradingModeProvider({ user, children }: ProviderProps) {
  const [mode, setModeState] = useState<TradingMode>(() =>
    typeof window === 'undefined' ? 'live' : readStoredMode(),
  )
  const [paperSummary, setPaperSummary] = useState<PaperSummary | null>(null)
  const [lastPaperToast, setPaperToast] = useState<string | null>(null)

  const setMode = useCallback(
    (next: TradingMode) => {
      if (next === 'paper' && !user) return
      setModeState(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
    },
    [user],
  )

  useEffect(() => {
    if (!user && mode === 'paper') setModeState('live')
  }, [user, mode])

  const refreshPaperSummary = useCallback(async () => {
    if (!user) {
      setPaperSummary(null)
      return
    }
    try {
      const res = await fetch('/api/paper/portfolio', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return
      const p = (json as { portfolio?: PaperSummary }).portfolio
      if (p) {
        setPaperSummary({
          cash: Number(p.cash) || 0,
          equity: Number(p.equity) || 0,
          totalPnl: Number(p.totalPnl) || 0,
          totalPnlPct: Number(p.totalPnlPct) || 0,
        })
      }
    } catch {
      /* ignore */
    }
  }, [user])

  useEffect(() => {
    if (mode !== 'paper' || !user) return
    void refreshPaperSummary()
    const id = window.setInterval(() => {
      void refreshPaperSummary()
    }, 45_000)
    return () => window.clearInterval(id)
  }, [mode, user, refreshPaperSummary])

  useEffect(() => {
    if (!lastPaperToast) return
    const id = window.setTimeout(() => setPaperToast(null), 4_500)
    return () => window.clearTimeout(id)
  }, [lastPaperToast])

  const value = useMemo(
    () => ({
      mode,
      setMode,
      isPaper: mode === 'paper',
      paperSummary,
      refreshPaperSummary,
      lastPaperToast,
      setPaperToast,
    }),
    [mode, setMode, paperSummary, refreshPaperSummary, lastPaperToast],
  )

  return <TradingModeContext.Provider value={value}>{children}</TradingModeContext.Provider>
}

export function useTradingMode(): TradingModeContextValue {
  const ctx = useContext(TradingModeContext)
  if (!ctx) {
    throw new Error('useTradingMode must be used within TradingModeProvider')
  }
  return ctx
}

/** Safe hook when provider may be absent (e.g. marketing pages). */
export function useTradingModeOptional(): TradingModeContextValue | null {
  return useContext(TradingModeContext)
}
