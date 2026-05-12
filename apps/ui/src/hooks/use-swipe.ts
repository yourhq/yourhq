"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Direction = "left" | "right"

interface SwipeState {
  swiping: boolean
  direction: Direction | null
  offset: number
}

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
  enabled?: boolean
}

export function useSwipeGesture(
  ref: React.RefObject<HTMLElement | null>,
  { onSwipeLeft, onSwipeRight, threshold = 80, enabled = true }: SwipeHandlers
): SwipeState {
  const [state, setState] = useState<SwipeState>({
    swiping: false,
    direction: null,
    offset: 0,
  })

  const startX = useRef(0)
  const startY = useRef(0)
  const tracking = useRef(false)

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return
      const touch = e.touches[0]
      startX.current = touch.clientX
      startY.current = touch.clientY
      tracking.current = true
      setState({ swiping: false, direction: null, offset: 0 })
    },
    [enabled]
  )

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!tracking.current || !enabled) return
      const touch = e.touches[0]
      const dx = touch.clientX - startX.current
      const dy = touch.clientY - startY.current

      // Only track horizontal swipes (dx must exceed 2x dy)
      if (Math.abs(dy) > Math.abs(dx) * 0.5 && Math.abs(dx) < 10) {
        tracking.current = false
        setState({ swiping: false, direction: null, offset: 0 })
        return
      }

      const direction: Direction = dx > 0 ? "right" : "left"
      setState({ swiping: true, direction, offset: dx })
    },
    [enabled]
  )

  const onTouchEnd = useCallback(() => {
    if (!tracking.current || !enabled) return
    tracking.current = false

    if (state.swiping && Math.abs(state.offset) >= threshold) {
      if (state.direction === "left") onSwipeLeft?.()
      if (state.direction === "right") onSwipeRight?.()
    }

    setState({ swiping: false, direction: null, offset: 0 })
  }, [enabled, state, threshold, onSwipeLeft, onSwipeRight])

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: true })
    el.addEventListener("touchend", onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
    }
  }, [ref, enabled, onTouchStart, onTouchMove, onTouchEnd])

  return state
}
