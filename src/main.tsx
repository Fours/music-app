import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV) {
  // Handy for poking at the running app from the console.
  void Promise.all([import('./app/controller'), import('./audio/engine')]).then(([c, e]) => {
    Object.assign(window, { drift: { app: c.app, engine: e.engine } })
  })
}
