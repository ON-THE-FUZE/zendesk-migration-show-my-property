import { join } from 'desm';
import { readFileSync } from 'node:fs';
import hubspotClient from '../../../../global/hubspot/hubspot.js';
import { noteLogger } from '../../../../global/logger/pino.js';
import mapping from '../../../../global/mapping/mapping.js';
import zendesk from '../../../../global/zendesk/index.js';
import { addData, countData, loadData } from '../../../../utils/jsonSave.js';
import asyncRetryWithBackoff from '../../../../utils/rateLimit.js';

const ZERO = 0;
const ONE = 1;

// Paths
const PATH_SAVE_DATA = join(import.meta.url, '../data/notesData.json');
const PATH_OBJECTS_MIGRATED = join(
  import.meta.url,
  '../data/notesMigrated.json',
);
const PATH_OBJECT_NO_CORE = join(
  import.meta.url,
  '../data/notesWithoutCoreObject.json',
);

// Models
const ownersMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/owners.json')),
);

const contactsIDs = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/contactsIDs.json')),
);

const dealsIDs = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/dealsIDs.json')),
);

const resourceType = {
  lead: {
    path: contactsIDs,
    associationTypeId: 202,
  },
  contact: {
    path: contactsIDs,
    associationTypeId: 202,
  },
  deal: {
    path: dealsIDs,
    associationTypeId: 214,
  },
};

const getNotesData = async () => {
  noteLogger.info('Getting the notes from the CRM...');
  let page = 1;
  let count = 0;
  const perPage = 100;

  do {
    try {
      noteLogger.info(`Getting the notes from the page ${page}`);
      const params = {
        page,
        per_page: perPage,
      };

      const response = await asyncRetryWithBackoff(
        zendesk.sell.notes.all.bind(zendesk),
        [params],
      );

      count = response?.meta?.count;
      page++;
      addData(PATH_SAVE_DATA, response?.items);
    } catch (error) {
      noteLogger.error(
        `Error getting the data for the page ${page} - ${error}`,
      );
      continue;
    }
  } while (count !== ZERO);

  return countData(PATH_SAVE_DATA);
};

const countNotesData = () => {
  return countData(PATH_SAVE_DATA);
};

const filterExistingObjects = async (data) => {
  const dataMigrated = loadData(PATH_OBJECTS_MIGRATED);

  return data.map((object) => {
    const activityExist = dataMigrated.find(objectMigrated =>
      Number(objectMigrated.zendeskID) === Number(object.id)
    );

    if (activityExist) {
      object.action = 'update';
      object.hubID = activityExist.hubID;
    } else {
      if (object.action !== 'update') {
        object.action = 'create';
      }
    }

    return object;
  });
};

const setAssociation = (id, associationTypeId) => {
  if (!id) {
    return null;
  }

  return {
    to: {
      id,
    },
    types: [
      {
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId,
      },
    ],
  };
};

const notesMigrationBatch = async ({ init, end, notes }) => {
  try {
    const inputsCreate = [];
    const inputsUpdate = [];

    const dataToEvaluate = await filterExistingObjects(notes);

    for (const note of dataToEvaluate) {
      const associations = [];

      let properties = null;

      properties = {
        hs_timestamp: Date.parse(note.created_at),
        hs_note_body: `${note.id} - ${note.content}`,
      };

      if (note.creator_id) {
        properties.hubspot_owner_id = ownersMapping[note.creator_id];
      }

      const objectType = resourceType[note.resource_type];
      const dataCoreObject = objectType.path;

      const coreObject = dataCoreObject.find(value =>
        Number(value.zendeskID) === Number(note.resource_id)
      );

      if (!coreObject) {
        noteLogger.info(
          `The note ${note.id} doesn't have a core object on Hubspot`,
        );
        addData(PATH_OBJECT_NO_CORE, note);
        continue;
      } else {
        const hubID = coreObject.hubID;

        associations.push(
          setAssociation(hubID, objectType.associationTypeId),
        );
      }

      noteLogger.info(
        `The note with Zendesk ID ${note.id} will be ${note.action}`,
      );

      if (note.action === 'create') {
        inputsCreate.push({ properties, associations });
      } else {
        const id = note.hubID;
        inputsUpdate.push({ id, properties, associations });
      }
    }

    if (inputsCreate.length > ZERO) {
      const results = await asyncRetryWithBackoff(
        () =>
          hubspotClient.crm.objects.notes.batchApi.create({
            inputs: inputsCreate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_OBJECTS_MIGRATED, {
          zendeskID: object.properties.hs_note_body
            .split('-')[ZERO].trim(),
          hubID: object.id,
          action: 'created',
          timestamp: new Date(),
        });
      }
    }

    if (inputsUpdate.length > ZERO) {
      const results = await asyncRetryWithBackoff(
        () =>
          hubspotClient.crm.objects.notes.batchApi.update({
            inputs: inputsUpdate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_OBJECTS_MIGRATED, {
          zendeskID: object.properties.hs_note_body
            .split('-')[ZERO].trim(),
          hubID: object.id,
          action: 'updated',
          timestamp: new Date(),
        });
      }
    }

    noteLogger.info(
      `The Batch of notes between the index ${init} and ${end} worked succesfully `,
    );
    return `The Batch of notes between the index ${init} and ${end} worked created succesfully`;
  } catch (error) {
    noteLogger.error(
      `Error migrating the batch notes between the index ${init} and ${end} - ${error}`,
    );
    return `The Batch of notes between the index ${init} and ${end} were an error  - ${error} `;
  }
};

const notesMigration = async ({ init, end, batch }) => {
  const data = loadData(PATH_SAVE_DATA);
  const info = data.map(note => note.data);

  const promises = [];

  for (let i = init; i < end; i += batch) {
    const notes = info.slice(i, i + batch);
    promises.push(notesMigrationBatch({ init: i, end: i + batch, notes }));
  }

  const results = await Promise.all(promises);
  console.log({ results });
  noteLogger.info({ results });
};

export { countNotesData, getNotesData, notesMigration };
