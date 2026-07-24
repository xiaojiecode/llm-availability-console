import { onMounted, onUnmounted, readonly, shallowRef } from 'vue'
import { userscriptBridge, type UserscriptStatus } from '../services/userscript'

export function useUserscript() {
  const status = shallowRef<UserscriptStatus>(userscriptBridge.getStatus())
  let unsubscribe: (() => void) | undefined

  onMounted(() => {
    unsubscribe = userscriptBridge.subscribe((value) => {
      status.value = value
    })
    userscriptBridge.start()
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  return {
    status: readonly(status),
    recheck: () => userscriptBridge.recheck(),
  }
}
