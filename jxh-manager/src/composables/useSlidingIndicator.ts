import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

type SlidingIndicatorOptions = {
  container: Ref<HTMLElement | null>
  target: () => HTMLElement | null
  observeElements?: () => Element[]
}

export function useSlidingIndicator(options: SlidingIndicatorOptions) {
  const indicatorStyle = ref<Record<string, string>>({ opacity: '0' })
  let resizeObserver: ResizeObserver | null = null

  async function updateIndicator(): Promise<void> {
    await nextTick()
    const container = options.container.value
    const target = options.target()
    if (!container || !target) {
      indicatorStyle.value = { opacity: '0' }
      return
    }

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    indicatorStyle.value = {
      opacity: '1',
      width: `${targetRect.width}px`,
      height: `${targetRect.height}px`,
      transform: `translate3d(${targetRect.left - containerRect.left}px, ${targetRect.top - containerRect.top}px, 0)`,
    }
  }

  onMounted(() => {
    window.addEventListener('resize', updateIndicator)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        void updateIndicator()
      })
      if (options.container.value) resizeObserver.observe(options.container.value)
      options.observeElements?.().forEach((element) => resizeObserver?.observe(element))
    }
    void updateIndicator()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateIndicator)
    resizeObserver?.disconnect()
  })

  return { indicatorStyle, updateIndicator }
}
