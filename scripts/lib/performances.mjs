const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const endDate = event => event.endDate || event.startDate
export function londonDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now)
}
export function splitPerformances(events, today = londonDate()) {
  return {
    upcoming: events.filter(event => endDate(event) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    past: events.filter(event => endDate(event) < today).sort((a, b) => b.startDate.localeCompare(a.startDate)),
  }
}
export function renderPerformances(events, today) {
  const {upcoming, past} = splitPerformances(events, today)
  if (!upcoming.length) return ''
  const renderEvent = event => `<li class="performance-entry">
    <p class="performance-date">${escape(event.dateLabel)}</p>
    <h4>${escape(event.title)}</h4>
    ${event.description ? `<p>${escape(event.description)}</p>` : ''}
    ${event.url ? `<a class="performance-link" href="${escape(event.url)}">Event details<span class="performance-link-end">&nbsp;↗</span></a>` : ''}
  </li>`
  return `<section id="performances" aria-labelledby="performances-title" class="performances-groups">
    <h2 id="performances-title">Performances</h2>
    <section aria-labelledby="upcoming-performances"><h3 id="upcoming-performances">Upcoming performances</h3>
    <ul class="performance-list">${upcoming.map(renderEvent).join('\n')}</ul></section>
    <details class="past-performances"><summary id="past-performances">Past performances</summary>
    ${past.length ? `<ul class="performance-list">${past.map(renderEvent).join('\n')}</ul>` : '<p>No past performances are listed.</p>'}</details>
  </section>`
}


export const PERFORMANCE_QUERY = '*[_type == "performance"]{_id,title,dateLabel,startDate,endDate,description,url}'
export function validatePerformances(events) {
  if (!Array.isArray(events)) throw new Error('Performance snapshot must be a list')
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  return events.map(event => {
    for (const field of ['title', 'dateLabel']) if (typeof event[field] !== 'string' || !event[field].trim()) throw new Error(`Performance missing ${field}`)
    if (!date(event.startDate) || (event.endDate && (!date(event.endDate) || event.endDate < event.startDate))) throw new Error('Invalid performance date range')
    if (event.url) {
      const url = new URL(event.url)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Performance link must be a public HTTPS URL')
    }
    return {...event, description: event.description || ''}
  })
}
export async function buildPerformances(fallback, fetchPublished, today) {
  try { return {html: renderPerformances(validatePerformances(await fetchPublished()), today), usedFallback: false} }
  catch (error) {
    console.warn(`::warning::Sanity performances unavailable, using committed performance fallback. ${error.message}`)
    return {html: renderPerformances(validatePerformances(fallback), today), usedFallback: true}
  }
}
export async function seedPerformances(client, events) {
  const data = validatePerformances(events)
  const existing = await client.fetch('*[_type == "performance"]{_id,sourceKey}')
  const keys = new Set(existing.map(doc=>doc.sourceKey).filter(Boolean))
  let created = 0
  for (const {id, ...fields} of data) {
    if (keys.has(id)) continue
    await client.create({_type:'performance', sourceKey:id, ...fields})
    keys.add(id); created += 1
  }
  return {created}
}
