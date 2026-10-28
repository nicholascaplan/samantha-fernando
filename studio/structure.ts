import type {StructureResolver} from 'sanity/structure'

export const SINGLETON_TYPES = ['biographyPage', 'worksMediaSettings']
const CATALOGUE_TYPES = ['work', 'recording', 'film']

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Website Content')
    .items([
      S.listItem()
        .title('Biography Page')
        .id('biographyPage')
        .child(
          S.document().schemaType('biographyPage').documentId('biographyPage').title('Biography Page'),
        ),
      S.documentTypeListItem('performance').title('Performances'),
      S.divider(),
      S.listItem().title('Works & Media').child(
        S.list().title('Works & Media').items([
          S.listItem().title('Settings & Default Recording').child(
            S.document().schemaType('worksMediaSettings').documentId('worksMediaSettings').title('Works & Media Settings'),
          ),
          S.divider(),
          S.documentTypeListItem('work').title('Works'),
          S.documentTypeListItem('recording').title('Recordings (Listen)'),
          S.documentTypeListItem('film').title('Films (Watch)'),
        ]),
      ),
      ...S.documentTypeListItems().filter((item) => ![...SINGLETON_TYPES, ...CATALOGUE_TYPES, 'performance'].includes(item.getId() as string)),
    ])
