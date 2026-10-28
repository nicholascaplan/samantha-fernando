import {defineField, defineType} from 'sanity'
import {noEmDash} from '../shared/validation'

export const performance = defineType({
  name: 'performance', title: 'Performance', type: 'document',
  fields: [
    defineField({name:'title', type:'string', validation: rule => rule.required().custom(noEmDash)}),
    defineField({name:'dateLabel', title:'Date as shown on the website', type:'string', description:'For example 23 February 2027 or May/June 2027. Do not invent a day for a month-only announcement.', validation:rule=>rule.required().custom(noEmDash)}),
    defineField({name:'startDate', title:'First date for sorting', type:'date', description:'For a month-only announcement, use the first day of its first month. Only the date label is displayed.', validation:rule=>rule.required()}),
    defineField({name:'endDate', title:'Last date (optional)', type:'date', description:'For a month-only announcement, use the last day of its final month. The event stays upcoming through this date.', validation:rule=>rule.custom((value, context)=>!value || !context.document?.startDate || value >= String(context.document.startDate) || 'Last date must not be before first date.')}),
    defineField({name:'isWorldPremiere', title:'World premiere', type:'boolean', description:'Labels this performance only, not every date for the work.', initialValue:false}),
    defineField({name:'location', title:'Location (optional)', type:'string', description:'Venue and city. Leave blank if not announced; the website omits the line.', validation:rule=>rule.custom(noEmDash)}),
    defineField({name:'description', type:'text', rows:3, description:'Performers, venue and supplied details. Leave unknown facts out.', validation:rule=>rule.custom(noEmDash)}),
    defineField({name:'url', title:'Event details link', type:'url', description:'Optional public event page.', validation:rule=>rule.uri({scheme:['https']})}),
    defineField({name:'sourceKey', type:'string', hidden:true, readOnly:true}),
  ],
  orderings:[{title:'Newest first',name:'newest',by:[{field:'startDate',direction:'desc'}]}],
  preview:{select:{title:'title',subtitle:'dateLabel'}},
})
