import { useEffect, useState } from 'react'
import { app } from '../app/controller'
import { oscillationOf, type OscParam } from '../world/oscillate'
import type { WorldObject } from '../world/types'

/** A slider's value right now, re-rendering every frame while it oscillates. */
export function useLive(o: WorldObject, param: OscParam): number {
  const active = !!oscillationOf(o, param)?.on
  const [, tick] = useState(0)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      tick((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active])
  return app.world.live(o, param)
}
