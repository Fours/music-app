// Checks that the production build in dist/ works with no network, which the
// iOS app needs: it fails if any file points at another host, or if index.html
// links to a file that isn't in the build. Run after `npm run build`.
//
//   node scripts/check-offline.mjs

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.txt'])

// URLs that appear in the build but are never fetched.
const ALLOWED = [
  /^https?:\/\/www\.w3\.org\//, // XML namespaces (SVG, XLink, MathML)
  /^https:\/\/react\.dev\/errors\//, // React's error-message links
  /^https:\/\/github\.com\/Tonejs\/Tone\.js\/wiki\//, // Tone.js warning text
]

const URL_RE = /(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d+)?[^\s"'`)<>\\]*/gi

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.')
  process.exit(1)
}

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else files.push(path)
  }
}
walk(DIST)

const problems = []

for (const file of files) {
  if (!TEXT.has(extname(file))) continue
  const text = readFileSync(file, 'utf8')
  for (const [url] of text.matchAll(URL_RE)) {
    if (!ALLOWED.some((re) => re.test(url))) problems.push(`${relative(DIST, file)}: external URL ${url}`)
  }
}

// Every local file index.html links to must be in the build.
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
for (const [, ref] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue
  const path = join(DIST, ref.replace(/^\.?\//, '').split(/[?#]/)[0])
  if (!existsSync(path)) problems.push(`index.html: links to ${ref}, which is not in dist/`)
}

if (problems.length) {
  console.error(`Offline check failed:\n${problems.map((p) => `  ${p}`).join('\n')}`)
  console.error('\nBundle the file, or add the URL to ALLOWED in scripts/check-offline.mjs if it is never fetched.')
  process.exit(1)
}
console.log(`Offline check passed: ${files.length} files in dist/, no external URLs.`)
