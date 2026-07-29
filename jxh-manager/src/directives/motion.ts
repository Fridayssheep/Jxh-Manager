import type { ObjectDirective } from 'vue'

type ResizeMotion = {
  animation: Animation
  overflow: string
}

type MotionElement = HTMLElement & {
  __resizeFrom?: number
  __resizeMotion?: ResizeMotion
  __riseAnimation?: Animation
}

const fallbackDuration = 220
const motionEasing = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function motionDuration(): number {
  if (typeof document === 'undefined') return fallbackDuration
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--duration-overlay')
  const duration = Number.parseFloat(value)
  return Number.isFinite(duration) && duration > 0 ? duration : fallbackDuration
}

function cancelResize(element: MotionElement): void {
  const motion = element.__resizeMotion
  if (!motion) return
  element.__resizeMotion = undefined
  element.style.overflow = motion.overflow
  motion.animation.cancel()
}

function cancelRise(element: MotionElement): void {
  const animation = element.__riseAnimation
  if (!animation) return
  element.__riseAnimation = undefined
  animation.cancel()
}

export const vSmoothResize: ObjectDirective<MotionElement> = {
  beforeUpdate(element) {
    element.__resizeFrom = element.getBoundingClientRect().height
    cancelResize(element)
  },

  updated(element) {
    const from = element.__resizeFrom
    element.__resizeFrom = undefined
    if (
      from === undefined ||
      prefersReducedMotion() ||
      typeof element.animate !== 'function'
    ) {
      return
    }

    const to = element.getBoundingClientRect().height
    if (Math.abs(from - to) < 0.5) return

    const overflow = element.style.overflow
    element.style.overflow = 'clip'
    const animation = element.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      {
        duration: motionDuration(),
        easing: motionEasing,
      },
    )
    const motion = { animation, overflow }
    element.__resizeMotion = motion

    const finish = (): void => {
      if (element.__resizeMotion !== motion) return
      element.__resizeMotion = undefined
      element.style.overflow = overflow
    }
    animation.onfinish = finish
    animation.oncancel = finish
  },

  unmounted(element) {
    cancelResize(element)
  },
}

export const vRiseOnChange: ObjectDirective<MotionElement, unknown> = {
  updated(element, binding) {
    if (Object.is(binding.value, binding.oldValue)) return
    cancelRise(element)
    if (prefersReducedMotion() || typeof element.animate !== 'function') return

    const animation = element.animate(
      [
        { opacity: 0.25, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      {
        duration: motionDuration(),
        easing: motionEasing,
      },
    )
    element.__riseAnimation = animation

    const finish = (): void => {
      if (element.__riseAnimation === animation) element.__riseAnimation = undefined
    }
    animation.onfinish = finish
    animation.oncancel = finish
  },

  unmounted(element) {
    cancelRise(element)
  },
}
