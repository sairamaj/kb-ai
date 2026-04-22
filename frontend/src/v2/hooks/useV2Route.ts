import { useCallback, useEffect, useState } from 'react'
import { parsePathV2, routeToPath, V2Route } from '../routing'

/**
 * Manages route state synchronized with the browser URL via pushState/popstate.
 */
export function useV2Route() {
  const [route, setRouteState] = useState<V2Route>(() => parsePathV2(window.location.pathname))

  const navigate = useCallback((next: V2Route) => {
    const target = routeToPath(next)
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target)
    }
    setRouteState(next)
  }, [])

  const replace = useCallback((next: V2Route) => {
    const target = routeToPath(next)
    if (window.location.pathname !== target) {
      window.history.replaceState({}, '', target)
    }
    setRouteState(next)
  }, [])

  useEffect(() => {
    function handlePop() {
      setRouteState(parsePathV2(window.location.pathname))
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  return { route, navigate, replace }
}
