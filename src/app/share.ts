import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * The iOS share sheet for recordings and clips. Download links do nothing in a
 * WKWebView, so the file is written to the app's cache and handed to the
 * share sheet, which offers Save Video (Photos), Save to Files, Messages and
 * so on.
 */

const DIR = 'share'
/**
 * The file crosses to the native side as base64, a piece at a time, so a long
 * clip (100 MB or more) never sits in memory as one huge string. A multiple
 * of 3 bytes, so every piece is whole base64 on its own.
 */
const PIECE = 3 * 1024 * 1024

/** Writes the file to the cache and returns its file:// URI. */
export async function writeShareFile(blob: Blob, name: string): Promise<string> {
  const path = `${DIR}/${name}`
  let uri = ''
  for (let at = 0; at < blob.size; at += PIECE) {
    const data = await base64(blob.slice(at, at + PIECE))
    if (at === 0) uri = (await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true })).uri
    else await Filesystem.appendFile({ path, data, directory: Directory.Cache })
  }
  return uri
}

/** Opens the share sheet. Resolves false if it was closed without sharing. */
export async function openShareSheet(uri: string): Promise<boolean> {
  try {
    await Share.share({ files: [uri] })
    return true
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return false
    throw err
  }
}

/** Deletes everything written for sharing. */
export async function clearShareFiles() {
  await Filesystem.rmdir({ path: DIR, directory: Directory.Cache, recursive: true }).catch(() => {})
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsDataURL(blob)
  })
}
