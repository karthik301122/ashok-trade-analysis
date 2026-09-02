import { useRef } from 'react'

/** Mount panel body once visited; stays mounted when hidden for instant tab return. */
export function usePanelKeepAlive(visible: boolean, initial = false): boolean {
  const visited = useRef(visible || initial)
  if (visible) visited.current = true
  return visited.current
}
