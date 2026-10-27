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

test('published performance snapshot is independent of fallback and intentionally empty lists stay empty', async () => {
  const {buildPerformances} = await import('../scripts/lib/performances.mjs')
  assert.deepEqual(await buildPerformances(events, async()=>[], '2026-10-27'), {html:'',usedFallback:false})
  const result = await buildPerformances(events, async()=>[{title:'incomplete'}], '2026-10-27')
  assert.equal(result.usedFallback,true)
  assert.match(result.html,/Ruby Hughes/)
})
test('invalid dates and unsafe event URLs reject the entire snapshot', async () => {
  const {validatePerformances} = await import('../scripts/lib/performances.mjs')
  for (const patch of [{startDate:'2027-02-30'},{endDate:'2020-01-01'},{url:'javascript:alert(1)'},{url:'https://user:secret@example.com'}]) {
    assert.throws(()=>validatePerformances([{...events[0],...patch}]))
  }
})
test('initial import leaves existing published documents and drafts unchanged', async () => {
  const {seedPerformances} = await import('../scripts/lib/performances.mjs')
  const created=[]
  const result=await seedPerformances({fetch:async()=>[{_id:'drafts.existing',sourceKey:events[0].id}],create:async doc=>created.push(doc)}, events.slice(0,2))
  assert.equal(result.created,1)
  assert.equal(created[0].sourceKey,events[1].id)
})

test('invalid description types reject the complete snapshot while absent text stays optional', async () => {
  const {buildPerformances, validatePerformances} = await import('../scripts/lib/performances.mjs')
  for (const description of [{text:'Wrong type'}, ['Wrong type'], 42, false]) {
    assert.throws(()=>validatePerformances([{...events[0],description}]), /description must be text/)
    const result = await buildPerformances(events, async()=>[{...events[0],description}], '2026-10-27')
    assert.equal(result.usedFallback,true)
    assert.equal(result.html,renderPerformances(events,'2026-10-27'))
  }
  for (const description of [undefined,null,'']) assert.equal(validatePerformances([{...events[0],description}])[0].description,'')
})

test('Wintering shares one past card without dropping any supplied dates or venues', () => {
  const html = renderPerformances(events,'2026-10-27')
  assert.equal((html.match(/<h4>Wintering<\/h4>/g)||[]).length,1)
  for(const event of events.filter(event=>event.title.startsWith('Wintering'))) {
    assert.ok(html.includes(event.dateLabel))
    assert.ok(html.includes(event.description.replace(/&/g,'&amp;')))
  }
  assert.match(html,/22 November 2025 · World Premiere/)
})
