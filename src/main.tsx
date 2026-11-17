import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'
import App from './App.tsx'
import { app } from './app/controller'

// Load the saved scene first, so the default one doesn't flash up before it.
// Don't wait forever: if storage never answers, start on the default scene.
const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
void Promise.race([app.restore(), new Promise((r) => window.setTimeout(r, 3000))]).then(render)

if (import.meta.env.DEV) {
  // Handy for poking at the running app from the console.
  void Promise.all([import('./app/controller'), import('./audio/engine')]).then(([c, e]) => {
    Object.assign(window, { drift: { app: c.app, engine: e.engine } })
  })
}
