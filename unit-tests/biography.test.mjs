import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {test} from 'node:test'
import {renderBiography, replaceRegion, validateBiography} from '../scripts/lib/biography.mjs'

const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8')

const span = (text, ...marks) => ({_type: 'span', _key: text.slice(0, 4), text, marks})
const block = (...children) => ({_type: 'block', _key: 'b', style: 'normal', markDefs: [], children})

const fixture = {
  eyebrow: 'Biography',
  heading: 'Samantha Fernando',
  contactCtaLabel: 'Discuss a commission or performance',
  milestonesHeading: 'Selected Milestones',
  educationHeading: 'Education & Fellowship',
  education:
    'Royal Academy of Music and University of Oxford. Honorary Research Fellow at Royal Holloway, University of London.',
  portrait: {alt: 'Samantha Fernando standing among green foliage', width: 1200, height: 800},
  body: [block(span('Plain '), span('bold', 'strong'), span(' and '), span('italic', 'em'), span('.'))],
  milestones: [{year: '2025', title: 'Wintering', detail: 'Wigmore Hall commission'}],
}

const normalise = (value) => value.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()

function fallbackRegion() {
  const match = html.match(/<!-- sanity:biography:start[^>]*-->([\s\S]*?)<!-- sanity:biography:end -->/)
  assert.ok(match, 'biography markers exist in index.html')
  return match[1]
}

test('renders the structure of the committed Biography fallback', () => {
  const out = renderBiography(fixture, {portraitSrc: 'assets/sam-1-1200.webp'})
  const fallback = fallbackRegion()
  for (const fragment of [
    'class="grid grid-cols-1 lg:grid-cols-3 gap-12"',
    'class="bio-mobile-portrait" aria-hidden="true"',
    'class="bio-contact-cta"',
    'aspect-[4/5] object-cover object-center',
    'glass-panel p-6 rounded-2xl border border-neutral-800 space-y-6',
    'Education &amp; Fellowship',
    'Discuss a commission or performance <span aria-hidden="true">→</span>',
  ]) {
    assert.ok(normalise(fallback).includes(normalise(fragment)), `fallback has ${fragment}`)
    assert.ok(normalise(out).includes(normalise(fragment)), `output has ${fragment}`)
  }
})

test('shows the birth year beneath the heading in fallback and rendered output', () => {
  const line = '<p class="mt-1 font-serif italic text-neutral-400">b. 1984</p>'
  const out = renderBiography(fixture, {portraitSrc: 'assets/sam-1-1200.webp'})
  assert.ok(out.includes(line), 'rendered output has the birth year line')
  assert.ok(fallbackRegion().includes(line), 'fallback has the birth year line')
  const headingAt = out.indexOf(fixture.heading)
  assert.ok(headingAt !== -1 && out.indexOf(line) > headingAt, 'birth year follows the heading')
})

test('renders marks with the same classes as the fallback', () => {
  const out = renderBiography(fixture, {portraitSrc: 'assets/x.webp'})
  assert.ok(out.includes('<strong class="text-neutral-100">bold</strong>'))
  assert.ok(out.includes('<em class="text-amber-300">italic</em>'))
  assert.ok(fallbackRegion().includes('<strong class="text-neutral-100">Philharmonia Orchestra</strong>'))
  assert.ok(fallbackRegion().includes('<em class="text-amber-300">Current, Rising</em>'))
})

test('escapes content from the CMS', () => {
  const doc = {
    ...fixture,
    heading: '<script>alert(1)</script>',
    body: [block(span('<img src=x onerror=alert(1)>'))],
    portrait: {...fixture.portrait, alt: '"><b>'},
    milestones: [{year: '2025', title: '<i>t</i>', detail: 'a & b'}],
  }
  const out = renderBiography(doc, {portraitSrc: 'assets/x.webp'})
  assert.ok(!out.includes('<script>'))
  assert.ok(!out.includes('<img src=x'))
  assert.ok(!out.includes('<i>t</i>'))
  assert.ok(out.includes('a &amp; b'))
})

test('applies the hotspot as object-position', () => {
  const doc = {...fixture, portrait: {...fixture.portrait, hotspot: {x: 0.5, y: 0.25}}}
  assert.ok(renderBiography(doc, {portraitSrc: 'assets/x.webp'}).includes('object-position: 50.0% 25.0%'))
})

test('reports missing required fields', () => {
  assert.deepEqual(validateBiography(fixture), [])
  assert.ok(validateBiography({...fixture, body: []}).includes('body'))
  assert.ok(validateBiography({...fixture, portrait: {width: 1, height: 1}}).includes('portrait.alt'))
})

test('replaces only the marked region and is idempotent', () => {
  const once = replaceRegion(html, 'biography', '<p>NEW</p>')
  assert.ok(once.includes('<p>NEW</p>'))
  assert.ok(!once.includes('In recent years, her music'))
  assert.ok(once.includes('<!-- sanity:biography:start'))
  assert.ok(once.includes('<!-- sanity:biography:end -->'))
  assert.ok(once.includes('id="tab-works"'))
  assert.equal(replaceRegion(once, 'biography', '<p>NEW</p>'), once)
  assert.throws(() => replaceRegion('<html></html>', 'biography', 'x'))
})
