import { onBeforeUnmount } from 'vue'

export function useSystemTheme() {
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')

  function applyTheme(event: MediaQueryList | MediaQueryListEvent) {
    document.documentElement.classList.toggle('dark', event.matches)
  }

  applyTheme(colorScheme)
  colorScheme.addEventListener('change', applyTheme)

  onBeforeUnmount(() => colorScheme.removeEventListener('change', applyTheme))
}
