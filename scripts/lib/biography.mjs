import {toHTML, escapeHTML} from '@portabletext/to-html'

const esc = (value) => escapeHTML(String(value ?? ''))

const bodyComponents = {
  block: {
    normal: ({children}) => `<p>${children}</p>`,
  },
  marks: {
    strong: ({children}) => `<strong class="text-neutral-100">${children}</strong>`,
    em: ({children}) => `<em class="text-amber-300">${children}</em>`,
  },
  // Unknown blocks, marks and types must never leak unescaped content.
  unknownBlockStyle: ({children}) => `<p>${children}</p>`,
  unknownMark: ({children}) => children,
  unknownType: () => '',
}

export function validateBiography(doc) {
  const missing = []
  for (const field of ['eyebrow', 'heading', 'contactCtaLabel', 'milestonesHeading', 'educationHeading', 'education']) {
    if (!doc?.[field]) missing.push(field)
  }
  if (!Array.isArray(doc?.body) || doc.body.length === 0) missing.push('body')
  if (!Array.isArray(doc?.milestones) || doc.milestones.length === 0) missing.push('milestones')
  if (!doc?.portrait?.alt) missing.push('portrait.alt')
  if (!doc?.portrait?.width || !doc?.portrait?.height) missing.push('portrait dimensions')
  return missing
}

export function renderBiography(doc, {portraitSrc}) {
  const hotspot = doc.portrait.hotspot
  const objectPosition = hotspot
    ? ` style="object-position: ${(hotspot.x * 100).toFixed(1)}% ${(hotspot.y * 100).toFixed(1)}%"`
    : ''
  const {width, height} = doc.portrait

  const body = toHTML(doc.body, {components: bodyComponents})
    .split('\n')
    .map((line) => `                    ${line}`)
    .join('\n')

  const milestones = doc.milestones
    .map(
      (m) =>
        `                            <div><span class="text-neutral-500 font-mono block">${esc(m.year)}</span><p class="text-neutral-200 font-medium">${esc(m.title)}</p><p class="text-neutral-400">${esc(m.detail)}</p></div>`,
    )
    .join('\n')

  return `<div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <article class="lg:col-span-2 space-y-6 text-neutral-300 leading-relaxed font-light text-base">
                    <div>
                        <span class="text-xs font-mono text-amber-500 tracking-widest uppercase">${esc(doc.eyebrow)}</span>
                        <h2 class="text-3xl sm:text-5xl font-serif font-light text-neutral-100 mt-2 leading-tight">${esc(doc.heading)}</h2>
                    </div>
                    <div class="bio-mobile-portrait" aria-hidden="true">
                        <img src="${esc(portraitSrc)}" alt="" width="${width}" height="${height}" loading="lazy"${objectPosition}>
                    </div>
${body}
                    <a href="/contact/" class="bio-contact-cta">${esc(doc.contactCtaLabel)} <span aria-hidden="true">→</span></a>
                </article>

                <aside class="space-y-6">
                    <figure class="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900">
                        <img src="${esc(portraitSrc)}" alt="${esc(doc.portrait.alt)}" width="${width}" height="${height}" class="w-full aspect-[4/5] object-cover object-center" loading="lazy"${objectPosition}>
                    </figure>
                    <div class="glass-panel p-6 rounded-2xl border border-neutral-800 space-y-6">
                        <h2 class="text-sm font-mono uppercase tracking-widest text-amber-400 border-b border-neutral-800 pb-3">${esc(doc.milestonesHeading)}</h2>
                        <div class="space-y-4 text-xs">
${milestones}
                        </div>
                        <div class="pt-4 border-t border-neutral-800">
                            <span class="text-xs font-mono uppercase text-neutral-400 block mb-2">${esc(doc.educationHeading)}</span>
                            <p class="text-xs text-neutral-300">${esc(doc.education)}</p>
                        </div>
                    </div>
                </aside>
            </div>`
}

export function replaceRegion(html, name, replacement) {
  const start = new RegExp(`([ \\t]*<!-- sanity:${name}:start[^>]*-->\\n)`)
  const endMarker = `<!-- sanity:${name}:end -->`
  const startMatch = html.match(start)
  const endIndex = html.indexOf(endMarker)
  if (!startMatch || endIndex === -1 || endIndex < startMatch.index) {
    throw new Error(`Markers for "${name}" not found in index.html`)
  }
  const before = html.slice(0, startMatch.index + startMatch[0].length)
  const endLineStart = html.lastIndexOf('\n', endIndex) + 1
  return `${before}            ${replacement}\n${html.slice(endLineStart)}`
}
