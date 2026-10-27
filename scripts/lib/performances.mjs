const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const eventCopy = value => String(value).trimEnd().replace(/(?<!\.)\.$/, '')
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
    <p class="performance-date">${escape(event.dateLabel)}${event.isWorldPremiere ? ' <span class="performance-premiere">World premiere</span>' : ''}</p>
    <h3>${escape(event.title)}</h3>
    ${event.location ? `<p class="performance-location">${escape(event.location)}</p>` : ''}
    ${event.description ? `<p>${escape(eventCopy(event.description))}</p>` : ''}
    ${event.url ? `<a class="performance-link" href="${escape(event.url)}"><span class="performance-link-label">Event details</span><span class="performance-link-end">&nbsp;↗</span></a>` : ''}
  </li>`
  const groupName = event => /^(Wintering|The Exoplanets)(?: \(World Premiere\))?$/i.exec(event.title)?.[1]
  const renderedGroups = new Set()
  const renderedPast = past.flatMap(event => {
    const name = groupName(event)
    if (!name) return [renderEvent(event)]
    if (renderedGroups.has(name)) return []
    renderedGroups.add(name)
    const stops = past.filter(stop=>groupName(stop)===name).sort((a,b)=>b.startDate.localeCompare(a.startDate))
    return [`<li class="performance-entry performance-tour"><h3>${escape(name)}</h3>
      <ul class="performance-tour-stops">${stops.map(stop => `<li><p class="performance-date">${escape(stop.dateLabel)}${stop.isWorldPremiere ? ' <span class="performance-premiere">World premiere</span>' : ''}</p>${stop.location ? `<p class="performance-location">${escape(stop.location)}</p>` : ''}${stop.description ? `<p>${escape(eventCopy(stop.description))}</p>` : ''}${stop.url ? `<a class="performance-link" href="${escape(stop.url)}"><span class="performance-link-label">Event details</span><span class="performance-link-end">&nbsp;↗</span></a>` : ''}</li>`).join('\n')}</ul></li>`]
  }).join('\n')
  return `<section id="performances" aria-labelledby="performances-title" class="performances-groups">
    <h2 id="performances-title">Upcoming performances</h2>
    <div>
    <ul class="performance-list">${upcoming.map(renderEvent).join('\n')}</ul></div>
    <details class="past-performances"><summary id="past-performances">Past performances</summary>
    ${past.length ? `<div class="past-performances-content"><ul class="performance-list">${renderedPast}</ul></div>` : '<p>No past performances are listed.</p>'}</details>
  </section>`
}


export const PERFORMANCE_QUERY = '*[_type == "performance"]{_id,title,dateLabel,startDate,endDate,location,isWorldPremiere,description,url}'
export function validatePerformances(events) {
  if (!Array.isArray(events)) throw new Error('Performance snapshot must be a list')
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  return events.map(event => {
    for (const field of ['title', 'dateLabel']) if (typeof event[field] !== 'string' || !event[field].trim()) throw new Error(`Performance missing ${field}`)
    if (!date(event.startDate) || (event.endDate && (!date(event.endDate) || event.endDate < event.startDate))) throw new Error('Invalid performance date range')
    if (event.isWorldPremiere != null && typeof event.isWorldPremiere !== 'boolean') throw new Error('Performance premiere flag must be boolean')
    if (event.location != null && typeof event.location !== 'string') throw new Error('Performance location must be text')
    if (event.description != null && typeof event.description !== 'string') throw new Error('Performance description must be text')
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
