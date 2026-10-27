import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {splitPerformances, renderPerformances, londonDate} from '../scripts/lib/performances.mjs'
const events = JSON.parse(await readFile(new URL('../content/performances.json', import.meta.url)))
test('supplied performances are ordered upcoming soonest first and past newest first', () => {
  const result = splitPerformances(events, '2026-10-27')
  assert.deepEqual(result.upcoming.map(x => x.id), ['formations-liverpool-2027', 'fretwork-skipton-2027', 'marian-consort-2027'])
  assert.deepEqual(result.past.slice(0, 2).map(x => x.id), ['balconies-singapore-2026', 'kinesphere-bloomsbury-2026'])
  assert.equal(result.past.length, 11)
})
test('date ranges stay upcoming through their final month, without inventing a performance date', () => {
  assert.equal(splitPerformances(events, '2027-06-30').upcoming.length, 1)
  assert.equal(splitPerformances(events, '2027-07-01').upcoming.length, 0)
  const html = renderPerformances(events, '2027-07-01')
  assert.equal(html, '')
  assert.match(renderPerformances(events, '2027-06-30'), /May\/June 2027/)
  assert.doesNotMatch(html, /1 May|30 June|datetime=/)
})
test('only verified event links are rendered and the chosen singer is preserved', () => {
  const html = renderPerformances(events, '2026-10-27')
  assert.equal((html.match(/class="performance-link"/g) || []).length, 4)
  assert.match(html, /Ruby Hughes/)
  assert.doesNotMatch(html, /Helen Charlston|TBC|to be confirmed/i)
  assert.equal(events.find(x => x.id === 'marian-consort-2027').url, undefined)
})
test('event copy is HTML escaped', () => {
  const html = renderPerformances([{title:'<unsafe>',description:'A & B',dateLabel:'2027',startDate:'2027-01-01'}], '2026-10-27')
  assert.match(html, /&lt;unsafe&gt;/)
  assert.match(html, /A &amp; B/)
})

test('London day boundaries drive production date classification', () => {
  assert.equal(londonDate(new Date('2027-06-30T22:59:59Z')), '2027-06-30')
  assert.equal(londonDate(new Date('2027-06-30T23:00:00Z')), '2027-07-01')
})
test('complete generated homepage omits all performances after the last range ends', async () => {
  const {renderPages} = await import('../scripts/lib/pages.mjs')
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const renderHome = today => renderPages(source.replace(/<!-- performances:start -->[\s\S]*?<!-- performances:end -->/, () => renderPerformances(events, today))).get('index.html')
  assert.match(renderHome('2026-10-27'), /id="performances"/)
  assert.match(renderHome('2027-06-30'), /May\/June 2027/)
  assert.doesNotMatch(renderHome('2027-07-01'), /id="performances"|id="past-performances"|Ruby Hughes/)
})
