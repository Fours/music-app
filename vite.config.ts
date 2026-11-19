import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const PRESET_SCENES = join(import.meta.dirname, 'src/world/preset-scenes.json')

/**
 * On the dev server only: the Scenes panel's "Save as default" posts the sky
 * here, and this writes it into src/world/preset-scenes.json under the mood's
 * id. src/world/presets.ts loads it in place of that mood's built-in scene.
 */
function savePresets(): Plugin {
  return {
    name: 'skyloom-save-preset',
    apply: 'serve',
    // The saved scene is the sky that's already playing, so don't reload the
    // page (which would stop the music); the next load picks the change up.
    // The file always exists: adding one would reload the page regardless.
    hotUpdate({ file, modules }) {
      if (file !== PRESET_SCENES) return
      for (const m of modules) this.environment.moduleGraph.invalidateModule(m)
      return []
    },
    configureServer(server) {
      server.middlewares.use('/__save-preset', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const { id, scene } = JSON.parse(body)
            // Only the moods presets.ts defines.
            const presets = readFileSync(join(import.meta.dirname, 'src/world/presets.ts'), 'utf8')
            const ids = [...presets.matchAll(/^ {4}id: '([a-z0-9-]+)',$/gm)].map((m) => m[1])
            if (!ids.includes(id)) throw new Error(`no mood with the id ${JSON.stringify(id)}`)
            if (typeof scene?.settings !== 'object' || !Array.isArray(scene.objects)) throw new Error('no scene')
            const saved = JSON.parse(readFileSync(PRESET_SCENES, 'utf8'))
            saved[id] = { settings: scene.settings, objects: scene.objects }
            writeFileSync(PRESET_SCENES, formatScenes(saved, ids))
            res.end('saved')
          } catch (e) {
            res.statusCode = 400
            res.end(e instanceof Error ? e.message : String(e))
          }
        })
      })
    },
  }
}

/** In the moods' order, one object per line, so a change to a scene is a readable diff. */
function formatScenes(saved: Record<string, { settings: object; objects: object[] }>, order: string[]) {
  const ids = Object.keys(saved).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const scenes = ids.map((id) => {
    const objects = saved[id].objects.map((o) => `      ${JSON.stringify(o)}`).join(',\n')
    return `  ${JSON.stringify(id)}: {\n    "settings": ${JSON.stringify(saved[id].settings)},\n    "objects": [\n${objects}\n    ]\n  }`
  })
  return ids.length ? `{\n${scenes.join(',\n')}\n}\n` : '{}\n'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), savePresets()],
})
