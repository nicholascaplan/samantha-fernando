import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {getCliClient} from 'sanity/cli'
import {seedPerformances} from '../../scripts/lib/performances.mjs'
const client = getCliClient({apiVersion:'2025-02-19'}).withConfig({perspective:'raw',useCdn:false})
const events = JSON.parse(await readFile(resolve(process.cwd(),'..','content/performances.json'),'utf8'))
const result = await seedPerformances(client, events)
console.log(`Performance import: ${result.created} created; existing records and drafts untouched.`)
