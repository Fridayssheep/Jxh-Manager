import { readonly, ref } from 'vue'

export type LoginTransitionPhase = 'idle' | 'sweeping' | 'fading'

const phase = ref<LoginTransitionPhase>('idle')

export const loginTransitionPhase = readonly(phase)

function reducedMotionPreferred(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
}

export async function playLoginTransition(navigate: () => Promise<unknown>): Promise<void> {
  const reducedMotion = reducedMotionPreferred()
  phase.value = 'sweeping'

  try {
    await wait(reducedMotion ? 20 : 560)
    await navigate()
    phase.value = 'fading'
    await wait(reducedMotion ? 20 : 320)
  } finally {
    phase.value = 'idle'
  }
}
