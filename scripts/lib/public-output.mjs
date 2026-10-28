import {readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {routes, notFoundPage} from './pages.mjs'

export const publicPages = [...routes.map(route => route.path === '/' ? 'index.html' : `${route.path.slice(1)}index.html`), notFoundPage.path.slice(1)]
export async function assertPublicOutput(directory, {testFontFixtures = false} = {}) {
  const allowed = new Set([...publicPages, 'CNAME', 'robots.txt', 'sitemap.xml'])
  async function inspect(relative = '') {
    for (const entry of await readdir(resolve(directory, relative), {withFileTypes: true})) {
      const name = relative + entry.name
      if (entry.isSymbolicLink()) throw new Error(`Symlink in public artifact: ${name}`)
      if (entry.isDirectory()) {
        if (!(testFontFixtures && (name === '_test-fonts' || /^_test-fonts\/(?:css|webfonts)$/.test(name))) && name !== 'assets' && !publicPages.some(page => page.startsWith(`${name}/`))) throw new Error(`Unexpected public directory: ${name}`)
        await inspect(`${name}/`)
      } else if (!(testFontFixtures && /^_test-fonts\/(?:css\/all\.min\.css|webfonts\/fa-[\w-]+\.(?:woff2|ttf))$/.test(name)) && !allowed.has(name) && !/^assets\/[\w.-]+\.(?:css|js|webp|png|jpe?g|svg|woff2?)$/.test(name)) {
        throw new Error(`Unexpected public file (possibly stale output): ${name}`)
      }
    }
  }
  await inspect()
}
