import * as React from "react"

export const BREAKPOINTS = { mobile: 768, tablet: 1024 } as const

export type Breakpoint = "mobile" | "tablet" | "desktop"

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINTS.mobile - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < BREAKPOINTS.mobile)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < BREAKPOINTS.mobile)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const check = () => {
      const w = window.innerWidth
      setIsTablet(w >= BREAKPOINTS.mobile && w < BREAKPOINTS.tablet)
    }
    const mqlMobile = window.matchMedia(`(min-width: ${BREAKPOINTS.mobile}px)`)
    const mqlTablet = window.matchMedia(`(max-width: ${BREAKPOINTS.tablet - 1}px)`)
    mqlMobile.addEventListener("change", check)
    mqlTablet.addEventListener("change", check)
    check()
    return () => {
      mqlMobile.removeEventListener("change", check)
      mqlTablet.removeEventListener("change", check)
    }
  }, [])

  return !!isTablet
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = React.useState<Breakpoint>("desktop")

  React.useEffect(() => {
    const check = () => {
      const w = window.innerWidth
      if (w < BREAKPOINTS.mobile) setBp("mobile")
      else if (w < BREAKPOINTS.tablet) setBp("tablet")
      else setBp("desktop")
    }
    const mqlMobile = window.matchMedia(`(max-width: ${BREAKPOINTS.mobile - 1}px)`)
    const mqlTablet = window.matchMedia(`(max-width: ${BREAKPOINTS.tablet - 1}px)`)
    mqlMobile.addEventListener("change", check)
    mqlTablet.addEventListener("change", check)
    check()
    return () => {
      mqlMobile.removeEventListener("change", check)
      mqlTablet.removeEventListener("change", check)
    }
  }, [])

  return bp
}
