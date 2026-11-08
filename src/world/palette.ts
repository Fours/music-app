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
