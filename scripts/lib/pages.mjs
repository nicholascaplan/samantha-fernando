import {createRequire} from 'node:module'
import {readCatalogueFallback, safeJson} from './catalogue.mjs'
const {renderCatalogueCards} = createRequire(import.meta.url)('../../assets/catalogue-renderer.js')

export const ORIGIN = 'https://www.samanthafernando.com'
export const routes = [
  {path: '/', tab: 'home', title: 'Samantha Fernando - Composer', description: 'Official website of British composer Samantha Fernando. Explore her compositions, recordings, films, writing and score-hire information.'},
  {path: '/biography/', tab: 'bio', title: 'Biography | Samantha Fernando', description: 'About British composer Samantha Fernando: her artistic practice, collaborations, selected milestones, education and fellowship.'},
  {path: '/works/', tab: 'works', title: 'Works & Media | Samantha Fernando', description: 'Explore compositions by Samantha Fernando, with instrumentation, commissions, premiere details, recordings and performance films.'},
  {path: '/writing/', tab: 'writing', title: 'Writing | Samantha Fernando', description: 'Essays by composer Samantha Fernando on creative process, composition and artistic philosophy.'},
  {path: '/contact/', tab: 'contact', title: 'Contact & Score Hire | Samantha Fernando', description: 'Contact Samantha Fernando about commissions, score hire, performance materials, performance notifications and academic enquiries.'},
]
const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function pageBody(source, tab) {
  const match = source.match(new RegExp(`<section id="tab-${tab}"[\\s\\S]*?(?=\\n\\s*<!-- =================|\\n\\s*</main>)`))
  if (!match) throw new Error(`Missing page source: ${tab}`)
  return match[0].trim().replace(/class="tab-content(?: active)? /, 'class="tab-content active ')
}

export function renderPages(source) {
  const data = readCatalogueFallback(source)
  const scriptMatch = source.match(/    <script>\s*document\.getElementById\('currentYear'\)[\s\S]*?<\/script>/)
  if (!scriptMatch) throw new Error('Shared site script not found')
  const runtime = scriptMatch[0].replace(/^\s*<script>/, '').replace(/<\/script>$/, '')
  const baseGraph = JSON.parse(source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph']
  const files = new Map([['assets/site.js', runtime]])
  for (const route of routes) {
    let body = pageBody(source, route.tab)
    if (route.tab !== 'home') body = body.replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/, '<h1$1>$2</h1>')
    if (route.tab === 'works') {
      body = body.replace(/(<div id="worksContainer"[^>]*>)[\s\S]*?<\/div>/, (_, opening) => `${opening}${renderCatalogueCards(data)}</div>`)
        .replace(/(<span id="worksEyebrow"[^>]*>)[\s\S]*?<\/span>/, (_, opening) => `${opening}${escape(data.settings.eyebrow)}</span>`)
        .replace(/(<h1 id="worksHeading"[^>]*>)[\s\S]*?<\/h1>/, (_, opening) => `${opening}${escape(data.settings.heading)}</h1>`)
        .replace(/(<p id="worksViewDescription"[^>]*>)[\s\S]*?<\/p>/, (_, opening) => `${opening}${escape(data.settings.worksDescription)}</p>`)
      body += '<noscript><p>Filters and in-page playback require JavaScript. Recordings and films are also available on <a href="https://on.soundcloud.com/Ohbj2UPBnWa5Scw8AB">SoundCloud</a>, <a href="https://open.spotify.com/artist/1AOLNCJ11mI6ewx8CZ8gvM">Spotify</a> and the provider links below.</p>' + data.media.map(item => `<p><a href="${escape(item.url)}">${escape(item.title)}</a></p>`).join('') + '</noscript>'
    }
    const graph = baseGraph.filter(item => item['@type'] === 'Person' || (route.tab === 'works' && item['@type'] === 'ItemList')).map(item => structuredClone(item))
    const list = graph.find(item => item['@type'] === 'ItemList')
    if (list) list['@id'] = `${ORIGIN}/works/#compositions`
    graph.push({'@type': route.tab === 'bio' ? 'AboutPage' : route.tab === 'contact' ? 'ContactPage' : 'WebPage', '@id': `${ORIGIN}${route.path}#page`, url: `${ORIGIN}${route.path}`, name: route.title, description: route.description, about: {'@id': `${ORIGIN}/#samantha-fernando`}})
    if (route.tab === 'writing') graph.push({'@type': 'Article', headline: 'On My Creative Process: 1. Wintering', author: {'@id': `${ORIGIN}/#samantha-fernando`}, mainEntityOfPage: `${ORIGIN}${route.path}`})
    let html = source.replace(/(<main\b[^>]*>)[\s\S]*?<\/main>/, (_, opening) => `${opening}\n${body}\n</main>`)
      .replace(scriptMatch[0], '<script src="/assets/catalogue-renderer.js"></script>\n    <script src="/assets/site.js"></script>')
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(route.title)}</title>`)
      .replace(/(<meta (?:name="(?:description|twitter:description)"|property="og:description") content=")[^"]*"/g, `$1${escape(route.description)}"`)
      .replace(/(<meta (?:name="twitter:title"|property="og:title") content=")[^"]*"/g, `$1${escape(route.title)}"`)
      .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${ORIGIN}${route.path}"`)
      .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${ORIGIN}${route.path}"`)
      .replace(/(<meta property="og:type" content=")[^"]*"/, `$1${route.tab === 'writing' ? 'article' : 'website'}"`)
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => `<script type="application/ld+json">${safeJson({'@context': 'https://schema.org', '@graph': graph})}</script>`)
      .replace(/\b(src|href)="assets\//g, '$1="/assets/')
    if (route.tab !== 'home') html = html.replace(/\s*<link rel="preload" as="image"[^>]*>/, '')
    // Mark the active destination even before the browser enhancement runs.
    html = html.replace(/<a\b[^>]*(?:id="nav-[^"]+"|data-mobile-nav="[^"]+")[^>]*>/g, opening => {
      const tab = opening.match(/(?:id="nav-|data-mobile-nav=")([a-z]+)/)[1]
      const active = tab === route.tab
      return active ? opening.replace('text-neutral-400', 'text-amber-400').replace('text-neutral-300', 'text-amber-400').replace('border-transparent', 'border-amber-400').replace('<a', '<a aria-current="page"') : opening
    })
    files.set(route.path === '/' ? 'index.html' : `${route.path.slice(1)}index.html`, html)
  }
  files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(route => `  <url><loc>${ORIGIN}${route.path}</loc></url>`).join('\n')}\n</urlset>\n`)
  return files
}
