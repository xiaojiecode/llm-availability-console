import gsap from 'gsap'
import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue'

export function useDashboardMotion(root: Readonly<Ref<HTMLElement | null>>) {
  let context: gsap.Context | undefined

  onMounted(async () => {
    await nextTick()
    if (!root.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    context = gsap.context(() => {
      gsap.fromTo(
        '.command-copy > *',
        { autoAlpha: 0, y: 22 },
        { autoAlpha: 1, y: 0, duration: 0.72, stagger: 0.08, ease: 'power3.out', delay: 0.08 },
      )

      gsap.fromTo(
        '.motion-reveal',
        { autoAlpha: 0, y: 24 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.68,
          stagger: 0.1,
          delay: 0.24,
          ease: 'power3.out',
          clearProps: 'opacity,visibility,transform',
        },
      )
    }, root.value)
  })

  onBeforeUnmount(() => context?.revert())
}
