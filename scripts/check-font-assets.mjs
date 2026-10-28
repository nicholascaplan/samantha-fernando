// Keep the production CDN dependency visible even though browser layout checks use pinned bytes.
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
export default async function verifyLiveFonts() {
const manifest = JSON.parse(await readFile(new URL('../tests/fixtures/font-awesome-6.4.0/manifest.json', import.meta.url), 'utf8'))
await Promise.all(manifest.files.map(async file => {
  const start = performance.now()
  const response = await fetch(file.url, {signal: AbortSignal.timeout(30_000), cache: 'no-store'})
  if (!response.ok) throw new Error(`${file.url}: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Live asset differs from pinned bytes: ${file.url}`)
  console.log(`${file.path}: verified (${Math.round(performance.now() - start)}ms)`)
}))

}
