import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

/**
 * Where the autosaved scene lives. iOS can clear a web view's storage when the
 * phone runs low on space, so the iOS app keeps it in Preferences (UserDefaults)
 * instead. The web build keeps using localStorage, as before.
 */

const NATIVE = Capacitor.isNativePlatform()

/**
 * Reads a saved value. In the iOS app, a value only in localStorage (saved by
 * an older version) is moved to Preferences and removed from localStorage, so
 * a stale copy can't come back later.
 */
export async function readSaved(key: string): Promise<string | null> {
  if (!NATIVE) return webGet(key)
  const { value } = await Preferences.get({ key })
  if (value !== null) return value
  const old = webGet(key)
  if (old === null) return null
  await Preferences.set({ key, value: old })
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to clean up if web storage is unavailable.
  }
  return old
}

/** Saves are written in order, so a slow older write can't land after a newer one. */
let queue: Promise<void> = Promise.resolve()

export function writeSaved(key: string, value: string): Promise<void> {
  queue = queue.then(() => (NATIVE ? Preferences.set({ key, value }) : webSet(key, value))).catch((err) => {
    // Private mode or full storage: autosave is a nicety, not a requirement.
    console.warn(`Autosave failed: ${String(err)}`)
  })
  return queue
}

function webGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function webSet(key: string, value: string) {
  localStorage.setItem(key, value)
}
