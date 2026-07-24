import { onMounted, onUnmounted, readonly, shallowRef } from 'vue'
import { browserExtensionBridge, type BrowserExtensionStatus } from '../services/browserExtension'

export function useBrowserExtension() {
  const status = shallowRef<BrowserExtensionStatus>(browserExtensionBridge.getStatus())
  let unsubscribe: (() => void) | undefined

  onMounted(() => {
    unsubscribe = browserExtensionBridge.subscribe((value) => {
      status.value = value
    })
    browserExtensionBridge.start()
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  return {
    status: readonly(status),
    recheck: () => browserExtensionBridge.recheck(),
  }
}
