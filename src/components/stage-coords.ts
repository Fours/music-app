/** Convert a client point to canvas fractions, or null if outside it. */
export function toCanvas(clientX: number, clientY: number): { x: number; y: number } | null {
  const el = document.querySelector('.stage')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const x = (clientX - r.left) / r.width
  const y = (clientY - r.top) / r.height
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null
}
