import type { Kind, TextureSound } from './types'

export const KIND_COLORS: Record<Kind, string> = {
  drone: '#9a8fd6',
  chime: '#e3976a',
  pulse: '#5aae9f',
  orbit: '#6a8fd8',
  texture: '#8aa5c2',
}

export const TEXTURE_COLORS: Record<TextureSound, string> = {
  rain: '#7f9cbc',
  wind: '#9cb08e',
  waves: '#6aaec1',
  embers: '#e39169',
}

export const INK = '#2a2d38'

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`
}

/** Shift a colour's hue by `deg`, keeping it soft. Used to tint drones by pitch. */
export function hueShift(hex: string, deg: number): string {
  const n = parseInt(hex.slice(1), 16)
  let r = ((n >> 16) & 255) / 255
  let g = ((n >> 8) & 255) / 255
  let b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  h = (h * 60 + deg + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  ;[r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** Darken (f < 1) or lighten (f > 1) a colour. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) =>
    Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))
      .toString(16)
      .padStart(2, '0')
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}
