import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

const native = Capacitor.isNativePlatform()

/**
 * A light tap when an object lands on the sky. Only in the iOS app: the web
 * build stays as it was. iPads have no Taptic Engine, so there it does nothing.
 */
export function placed() {
  if (!native) return
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}
