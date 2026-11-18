// Draws Skyloom's app icon: the favicon's mark (public/favicon.svg) at
// 1024 × 1024, in the light, dark and tinted versions iOS asks for.
//
//   swift scripts/render-icon.swift
//
// Writes ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-{light,dark,tinted}.png,
// and the light icon again at 512 × 512 as public/now-playing.png, the lock
// screen's Now Playing artwork (see src/app/now-playing.ts).
// The light icon is square and opaque: iOS rounds the corners itself, and
// App Store icons can't have an alpha channel. The dark and tinted versions
// leave the background clear so iOS can put its own behind them.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let size = 1024
// The favicon is drawn on a 64-unit grid.
let unit = CGFloat(size) / 64

struct RGBA { var r, g, b, a: CGFloat }

func hex(_ s: String, _ a: CGFloat = 1) -> RGBA {
  let v = Int(s.dropFirst(), radix: 16)!
  return RGBA(r: CGFloat((v >> 16) & 0xff) / 255, g: CGFloat((v >> 8) & 0xff) / 255, b: CGFloat(v & 0xff) / 255, a: a)
}

func gray(_ w: CGFloat, _ a: CGFloat = 1) -> RGBA { RGBA(r: w, g: w, b: w, a: a) }

struct Look {
  var background: RGBA?
  var glow: RGBA
  var ring: RGBA
  var orbitDot: RGBA
  var chimeDot: RGBA
}

let looks: [(name: String, look: Look)] = [
  ("light", Look(background: hex("#f6f4f0"), glow: hex("#9a8fd6", 0.9), ring: hex("#6a8fd8"), orbitDot: hex("#6a8fd8"), chimeDot: hex("#e3976a"))),
  // Lighter on the dark backdrop, so the ring doesn't sink into it.
  ("dark", Look(background: nil, glow: hex("#9a8fd6", 0.85), ring: hex("#8eaaf0"), orbitDot: hex("#8eaaf0"), chimeDot: hex("#f0a77c"))),
  // iOS tints by brightness, so the mark is drawn in greys.
  ("tinted", Look(background: nil, glow: gray(0.75, 0.7), ring: gray(1), orbitDot: gray(1), chimeDot: gray(0.85))),
]

let space = CGColorSpace(name: CGColorSpace.sRGB)!

/** The image at half size: plenty for the lock screen, and a quarter of the bytes. */
func half(_ image: CGImage) -> CGImage {
  let ctx = CGContext(data: nil, width: size / 2, height: size / 2, bitsPerComponent: 8, bytesPerRow: 0,
                      space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  ctx.interpolationQuality = .high
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: size / 2, height: size / 2))
  return ctx.makeImage()!
}

func color(_ c: RGBA) -> CGColor { CGColor(colorSpace: space, components: [c.r, c.g, c.b, c.a])! }

func render(_ look: Look) -> CGImage {
  let alpha: CGImageAlphaInfo = look.background == nil ? .premultipliedLast : .noneSkipLast
  let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: alpha.rawValue)!
  // Draw in the favicon's coordinates: y down, 64 units across.
  ctx.translateBy(x: 0, y: CGFloat(size))
  ctx.scaleBy(x: unit, y: -unit)

  if let bg = look.background {
    ctx.setFillColor(color(bg))
    ctx.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
  }

  // The drone's glow: fades from the centre to nothing at r = 22.
  var clear = look.glow
  clear.a = 0
  let gradient = CGGradient(colorsSpace: space, colors: [color(look.glow), color(clear)] as CFArray, locations: [0, 1])!
  let glowCentre = CGPoint(x: 28, y: 36)
  ctx.drawRadialGradient(gradient, startCenter: glowCentre, startRadius: 0, endCenter: glowCentre, endRadius: 22, options: [])

  // The orbit's ring and the body on it.
  ctx.setStrokeColor(color(look.ring))
  ctx.setLineWidth(2)
  ctx.strokeEllipse(in: CGRect(x: 36 - 14, y: 30 - 14, width: 28, height: 28))
  ctx.setFillColor(color(look.orbitDot))
  ctx.fillEllipse(in: CGRect(x: 36 - 3.5, y: 16 - 3.5, width: 7, height: 7))

  // A chime.
  ctx.setFillColor(color(look.chimeDot))
  ctx.fillEllipse(in: CGRect(x: 45 - 4.5, y: 42 - 4.5, width: 9, height: 9))

  return ctx.makeImage()!
}

// Run from the repo root (#filePath isn't the real path when run as a script).
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)

func write(_ image: CGImage, to path: String) {
  let url = root.appendingPathComponent(path)
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { fatalError("couldn't write \(url.path)") }
  print("wrote \(url.path)")
}

for (name, look) in looks {
  let image = render(look)
  write(image, to: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-\(name).png")
  if name == "light" { write(half(image), to: "public/now-playing.png") }
}
