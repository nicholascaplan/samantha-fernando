import {createHash} from 'node:crypto'
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createClient} from '@sanity/client'
import {renderBiography, replaceRegion, validateBiography} from './lib/biography.mjs'
import {buildCatalogue, CATALOGUE_QUERY} from './lib/catalogue.mjs'
import {renderPerformances, buildPerformances, PERFORMANCE_QUERY} from './lib/performances.mjs'
import {renderPages} from './lib/pages.mjs'
import {assertPublicOutput} from './lib/public-output.mjs'

const PROJECT_ID = '9a66iw1t'
const DATASET = 'production'
const root = resolve(import.meta.dirname, '..')
const outDir = resolve(root, process.argv[2] ?? '_site')
const useFallback = process.argv.includes('--fallback')
const useTestFonts = process.argv.includes('--test-font-fixtures')
if (useTestFonts && !useFallback) throw new Error('Test font fixtures require --fallback')
if (outDir === root || !outDir.startsWith(`${root}/_site`)) throw new Error('Build output must be a project _site directory')

const QUERY = `*[_id == "biographyPage"][0]{
  eyebrow, heading, body, contactCtaLabel, milestonesHeading, milestones[]{year, title, detail},
  educationHeading, education,
  "portrait": {
    "alt": portrait.alt,
    "url": portrait.asset->url,
    "width": portrait.asset->metadata.dimensions.width,
    "height": portrait.asset->metadata.dimensions.height,
    "hotspot": portrait.hotspot{x, y}
  }
}`

const client = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: '2025-02-19',
  useCdn: false,
  perspective: 'published',
})

async function buildBiography(html) {
  const doc = await client.fetch(QUERY)
  if (!doc) throw new Error('biographyPage document not found or not published')
  const missing = validateBiography({...doc, portrait: doc.portrait})
  if (missing.length) throw new Error(`biographyPage is missing: ${missing.join(', ')}`)

  const response = await fetch(`${doc.portrait.url}?w=1200&fm=webp&q=80`)
  if (!response.ok) throw new Error(`Portrait download failed: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
  const filename = `bio-portrait-${hash}.webp`
  await writeFile(resolve(outDir, 'assets', filename), bytes)

  return replaceRegion(html, 'biography', renderBiography(doc, {portraitSrc: `assets/${filename}`}))
}

await mkdir(resolve(outDir, 'assets'), {recursive: true})
await cp(resolve(root, 'assets'), resolve(outDir, 'assets'), {recursive: true})
for (const file of ['CNAME', 'robots.txt']) {
  await cp(resolve(root, file), resolve(outDir, file))
}

let html = await readFile(resolve(root, 'index.html'), 'utf8')
if (useTestFonts) {
  const fontRoot = resolve(root, 'tests/fixtures/font-awesome-6.4.0')
  const manifest = JSON.parse(await readFile(resolve(fontRoot, 'manifest.json'), 'utf8'))
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(fontRoot, file.path))
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Test font hash mismatch: ${file.path}`)
    const destination = resolve(outDir, '_test-fonts', file.path)
    await mkdir(resolve(destination, '..'), {recursive: true})
    await writeFile(destination, bytes)
  }
  html = html.replace('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', '/_test-fonts/css/all.min.css')
}
try {
  if (useFallback) throw new Error('Deterministic fallback build requested')
  html = await buildBiography(html)
  console.log('Biography rendered from Sanity.')
} catch (error) {
  console.warn(`::warning::Sanity content unavailable, using committed Biography fallback. ${error.message}`)
}
const catalogue = useFallback ? {html, usedFallback: true} : await buildCatalogue(html, () => client.fetch(CATALOGUE_QUERY))
const performances = JSON.parse(await readFile(resolve(root, 'content/performances.json'), 'utf8'))
const performanceSnapshot = useFallback ? {html: renderPerformances(performances, '2026-10-27'), usedFallback: true} : await buildPerformances(performances, () => client.fetch(PERFORMANCE_QUERY))
const content = catalogue.html.replace(/<!-- performances:start -->[\s\S]*?<!-- performances:end -->/, () => performanceSnapshot.html)
if (!performanceSnapshot.usedFallback) console.log('Performances rendered from Sanity.')
const pages = renderPages(content)
for (const [filename, content] of pages) {
  const destination = resolve(outDir, filename)
  await mkdir(resolve(destination, '..'), {recursive: true})
  await writeFile(destination, content)
}
await assertPublicOutput(outDir, {testFontFixtures: useTestFonts})
if (!catalogue.usedFallback) console.log('Works & Media rendered from Sanity.')
console.log(`Public site written to ${outDir}`)
