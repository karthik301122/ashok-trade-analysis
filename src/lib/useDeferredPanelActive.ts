import { useEffect, useState } from 'react'

/**
 * Lets the shell paint on the next frame before heavy panel content reconciles.
 * With sticky=true, content stays mounted once shown (for keep-alive hidden panels).
 */
export function useDeferredPanelActive(active: boolean, sticky = false): boolean {
  const [ready, setReady] = useState(active)

  useEffect(() => {
    if (!active) {
      if (!sticky) setReady(false)
      return
    }
    if (sticky && ready) return
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [active, sticky, ready])

  return ready
}
