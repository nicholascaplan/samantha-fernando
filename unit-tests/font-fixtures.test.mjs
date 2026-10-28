import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile, rm} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {assertPublicOutput} from '../scripts/lib/public-output.mjs'
const root = new URL('../', import.meta.url)
const fixture = new URL('../tests/fixtures/font-awesome-6.4.0/', import.meta.url)
test('pinned Font Awesome bytes match the source manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', fixture)))
  assert.equal(manifest.files.length, 9)
  for (const file of manifest.files) {
    assert.equal(createHash('sha256').update(await readFile(new URL(file.path, fixture))).digest('hex'), file.sha256)
    assert.equal(file.url, `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/${file.path}`)
  }
})
test('font fixture build is explicit, fallback-only and rejected by production artifact guard', async () => {
  const output = new URL('_site-font-fixture-test/', root)
  try {
    assert.throws(() => execFileSync('node', ['scripts/build-content.mjs', '_site-font-fixture-test', '--test-font-fixtures'], {cwd: root, stdio: 'pipe'}), /Test font fixtures require --fallback/)
    execFileSync('node', ['scripts/build-content.mjs', '_site-font-fixture-test', '--fallback', '--test-font-fixtures'], {cwd: root, stdio: 'pipe'})
    const html = await readFile(new URL('index.html', output), 'utf8')
    assert.match(html, /href="\/_test-fonts\/css\/all.min.css"/)
    await assert.rejects(assertPublicOutput(output.pathname), /Unexpected public directory/)
    await assertPublicOutput(output.pathname, {testFontFixtures: true})
    await rm(output, {recursive: true})
    execFileSync('node', ['scripts/build-content.mjs', '_site-font-fixture-test', '--fallback'], {cwd: root, stdio: 'pipe'})
    assert.match(await readFile(new URL('index.html', output), 'utf8'), /https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/font-awesome\/6.4.0\/css\/all.min.css/)
    await assertPublicOutput(output.pathname)
  } finally { await rm(output, {recursive: true, force: true}) }
})
test('live asset gate is PR smoke-only, never ordinary units or production artifact config', async () => {
  const {createRequire} = await import('node:module')
  const require = createRequire(import.meta.url)
  const configPath = require.resolve('../playwright.config.js')
  const saved = process.env.GITHUB_EVENT_NAME
  try {
    delete process.env.GITHUB_EVENT_NAME
    delete require.cache[configPath]
    assert.equal(require(configPath).globalSetup, undefined)
    process.env.GITHUB_EVENT_NAME = 'pull_request'
    delete require.cache[configPath]
    assert.match(require(configPath).globalSetup, /check-font-assets.mjs$/)
    assert.equal(require('../playwright.built.config.js').globalSetup, undefined)
  } finally {
    if (saved === undefined) delete process.env.GITHUB_EVENT_NAME
    else process.env.GITHUB_EVENT_NAME = saved
    delete require.cache[configPath]
  }
})
