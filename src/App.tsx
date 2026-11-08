import { useEffect } from 'react'
import { app } from './app/controller'
import { useStore } from './app/store'
import { Inspector } from './components/Inspector'
import { ScenesPanel, SettingsPanel } from './components/Panels'
import { Stage } from './components/Stage'
import { TopBar } from './components/TopBar'
import { Tray } from './components/Tray'
import { Welcome } from './components/Welcome'

export default function App() {
  const phase = useStore(app.ui, (s) => s.phase)
  const panel = useStore(app.ui, (s) => s.panel)
  const selectedId = useStore(app.ui, (s) => s.selectedId)
  const toast = useStore(app.ui, (s) => s.toast)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [role="slider"]')) return
      if (e.key === ' ' && !t.closest('button')) {
        e.preventDefault()
        app.togglePlay()
      } else if (e.key === 'Escape') {
        app.select(null)
        app.ui.set({ panel: 'none' })
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && app.ui.get().selectedId) {
        app.remove(app.ui.get().selectedId!)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const running = phase === 'running'
  return (
    <div className={`app ${running ? 'is-running' : ''}`}>
      <Stage />
      <div className="grain" aria-hidden />
      {running && (
        <>
          <TopBar />
          <Tray />
          {selectedId && <Inspector />}
          {!selectedId && panel === 'settings' && <SettingsPanel />}
          {!selectedId && panel === 'scenes' && <ScenesPanel />}
        </>
      )}
      {toast && (
        <div className="toast" key={toast.id} role="status">
          {toast.text}
        </div>
      )}
      <Welcome />
    </div>
  )
}
