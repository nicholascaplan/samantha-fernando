import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {renderPages, routes, ORIGIN} from '../scripts/lib/pages.mjs'
import {assertPublicOutput} from '../scripts/lib/public-output.mjs'
import {buildCatalogue, readCatalogueFallback, renderCatalogue} from '../scripts/lib/catalogue.mjs'

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const output = renderPages(source)
const pageFile = route => route.path === '/' ? 'index.html' : `${route.path.slice(1)}index.html`
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('each canonical route has distinct, complete static content and metadata', () => {
  assert.equal(routes.length, 8)
  const titles = new Set()
  for (const route of routes) {
    const html = output.get(pageFile(route))
    assert.ok(html)
    assert.ok(html.includes(`href="${ORIGIN}${route.path}"`))
    titles.add(html.match(/<title>(.*?)<\/title>/)[1])
    const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1]
    assert.equal((main.match(/id="tab-/g) || []).length, 1)
    assert.equal((main.match(/<h1\b/g) || []).length, 1)
    assert.match(main, /tab-content active/)
    assert.doesNotMatch(html, /(?:src|href)="assets\//)
    assert.doesNotMatch(html, /onclick="switchTab\(/)
    assert.match(html, /href="\/biography\/"/)
    assert.match(html, /href="\/listen\/"/)
    assert.match(html, /href="\/watch\/"/)
    assert.doesNotMatch(html, /works\/#(?:listen|watch)/)
    assert.doesNotMatch(html, /href="#(?:bio|home|works|writing|contact)"/)
  }
  assert.equal(titles.size, routes.length)
})

test('Works HTML uses the same catalogue snapshot as playback and structured data', () => {
  const data = readCatalogueFallback(source)
  data.works[0].title = 'A <new> composition & title'
  const files = renderPages(renderCatalogue(source, data))
  const html = files.get('works/index.html')
  assert.match(html, /<h3[^>]*>A &lt;new&gt; composition &amp; title<\/h3>/)
  assert.equal((html.match(/<h3\b/g) || []).length, data.works.length)
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph']
  assert.equal(graph.find(item => item['@type'] === 'ItemList').itemListElement.length, data.works.length)
  assert.ok(graph.find(item => item['@type'] === 'ItemList').itemListElement.some(item => item.item.name === data.works[0].title))
  assert.doesNotMatch(files.get('index.html'), /"@type": "ItemList"/)
})

test('Writing contains the full essay, portrait and video without an extra detail page', () => {
  const writing = output.get('writing/index.html')
  assert.match(writing, /Why do I write\? What makes me start\?/)
  assert.match(writing, /sam-3.webp/)
  assert.match(writing, /writing-video-title/)
  assert.match(writing, /"@type": "Article"/)
  assert.equal(output.has('writing/on-my-creative-process-wintering/index.html'), false)
  assert.doesNotMatch(writing, /Read the essay|All writing/)
})

test('Listen and Watch are distinct catalogue pages with their own metadata and view', () => {
  const data = readCatalogueFallback(source)
  const listen = output.get('listen/index.html')
  const watch = output.get('watch/index.html')
  assert.match(listen, /<h1 id="worksHeading"[^>]*>Listen<\/h1>/)
  assert.match(listen, new RegExp(escapeRegExp(data.settings.listenDescription)))
  assert.match(listen, /id="works-view-listen" class="[^"]*bg-amber-700[^"]*" aria-pressed="true"/)
  assert.match(listen, /<p id="recordingAvailabilityCopy" class="text-sm text-neutral-400">[^<]+<\/p>/)
  assert.equal((listen.match(/<h3\b/g) || []).length, data.media.filter(item => item.type === 'listen').length)
  assert.doesNotMatch(listen, /"@type": "ItemList"/)
  assert.match(watch, /<h1 id="worksHeading"[^>]*>Watch<\/h1>/)
  assert.match(watch, new RegExp(escapeRegExp(data.settings.watchDescription)))
  assert.match(watch, /id="works-view-watch" class="[^"]*bg-amber-700[^"]*" aria-pressed="true"/)
  assert.match(watch, /id="worksContainer" class="works-catalogue watch-catalogue"/)
  assert.equal((watch.match(/<h3\b/g) || []).length, data.media.filter(item => item.type === 'watch').length)
  assert.doesNotMatch(watch, /"@type": "ItemList"/)
})

test('sitemap includes only canonical public pages, without filters or invented timestamps', () => {
  const sitemap = output.get('sitemap.xml')
  assert.equal((sitemap.match(/<loc>/g) || []).length, routes.length)
  for (const route of routes) assert.ok(sitemap.includes(`<loc>${ORIGIN}${route.path}</loc>`))
  assert.doesNotMatch(sitemap, /#|mobilePreview|lastmod/)
})

test('failed CMS builds and intentionally empty catalogues still generate complete route sets', async () => {
  const failed = await buildCatalogue(source, async () => { throw new Error('offline') }, () => {})
  assert.equal(renderPages(failed.html).size, output.size)
  const empty = readCatalogueFallback(source)
  empty.works = []
  empty.media = []
  empty.settings.defaultRecording = null
  const html = renderPages(renderCatalogue(source, empty)).get('works/index.html')
  assert.match(html, /No compositions found/)
  assert.doesNotMatch(html, /<h3\b/)
})

test('artifact audit rejects private files and stale routes rather than silently publishing them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sam-pages-test-'))
  try {
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'index.html'), 'public')
    await writeFile(join(directory, 'assets/site.js'), 'public')
    await assertPublicOutput(directory)
    await writeFile(join(directory, 'README.md'), 'not public')
    await assert.rejects(assertPublicOutput(directory), /Unexpected public file/)
    await rm(join(directory, 'README.md'))
    await mkdir(join(directory, 'retired'))
    await assert.rejects(assertPublicOutput(directory), /Unexpected public directory/)
  } finally {
    await rm(directory, {recursive: true})
  }
})

test('Privacy page carries the full notice and every page footer links to it', () => {
  const privacy = output.get('privacy/index.html')
  assert.match(privacy, /<h1[^>]*>Privacy<\/h1>/)
  for (const heading of ['About this notice', 'Enquiries', 'Cookie settings', 'Analytics cookies', 'Display preference', 'Your choices']) {
    assert.match(privacy, new RegExp(heading))
  }
  assert.match(privacy, /formspree\.io\/legal\/privacy-policy/)
  assert.match(privacy, /policies\.google\.com\/privacy/)
  assert.match(privacy, /on the <span class="text-neutral-100">Privacy page<\/span>, linked in the footer/)
  for (const route of routes) {
    const html = output.get(pageFile(route))
    assert.match(html, /href="\/privacy\/#cookie-settings" class="[^"]*">Privacy<\/a>/)
    assert.doesNotMatch(html, /All rights reserved/)
    assert.match(html, /Made with <span class="text-red-600 text-lg leading-none">\u2665<\/span> by/)
    const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1]
    // The Cookie preferences control lives only in the Privacy page's Cookie settings panel.
    assert.equal((main.match(/id="manageAnalyticsCookies"/g) || []).length, route.path === '/privacy/' ? 1 : 0)
  }
})

test('trailing arrows stay glued to the final word of their link label', () => {
  for (const route of routes) {
    const html = output.get(pageFile(route))
    for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
      if (match[1].includes('\u2197')) assert.match(match[1], /(?:\u00a0|&nbsp;)\u2197/)
    }
  }
})
