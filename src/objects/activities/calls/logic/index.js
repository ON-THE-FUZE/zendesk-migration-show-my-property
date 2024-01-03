import { join } from 'desm';
import { readFileSync } from 'node:fs';
import hubspotClient from '../../../../global/hubspot/hubspot.js';
import { callLogger } from '../../../../global/logger/pino.js';
import zendesk from '../../../../global/zendesk/index.js';
import { addData, countData, loadData } from '../../../../utils/jsonSave.js';
import asyncRetryWithBackoff from '../../../../utils/rateLimit.js';

const ZERO = 0;
const MIL = 1000;

// Paths
const PATH_SAVE_DATA = join(import.meta.url, '../data/callsData.json');
const PATH_OBJECTS_MIGRATED = join(
  import.meta.url,
  '../data/callsMigrated.json',
);
const PATH_OBJECT_NO_CORE = join(
  import.meta.url,
  '../data/callsWithoutCoreObject.json',
);

// Models
const callsOutcomes = JSON.parse(
  readFileSync(join(import.meta.url, '../models/callsOutcomes.json')),
);

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
    associationTypeId: 194,
  },
  contact: {
    path: contactsIDs,
    associationTypeId: 194,
  },
  deal: {
    path: dealsIDs,
    associationTypeId: 206,
  },
};

const getCallsData = async () => {
  callLogger.info('Getting the calls from the CRM...');
  let page = 1;
  let count = 0;
  const perPage = 100;

  do {
    try {
      callLogger.info(`Getting the calls from the page ${page}`);
      const params = {
        page,
        per_page: perPage,
      };

      const response = await asyncRetryWithBackoff(
        zendesk.sell.calls.all.bind(zendesk),
        [params],
      );

      count = response?.meta?.count;
      page++;
      addData(PATH_SAVE_DATA, response?.items);
    } catch (error) {
      callLogger.error(
        `Error getting the data for the page ${page} - ${error}`,
      );
      continue;
    }
  } while (count !== ZERO);

  return countData(PATH_SAVE_DATA);
};

const countCallsData = () => {
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

const callsMigrationBatch = async ({ init, end, calls }) => {
  try {
    const inputsCreate = [];
    const inputsUpdate = [];

    const dataToEvaluate = await filterExistingObjects(calls);

    for (const call of dataToEvaluate) {
      const associations = [];

      let properties = null;

      properties = {
        hs_timestamp: Date.parse(call.made_at),
        hs_call_body: `${call.id} - ${call.summary}`,
        hs_call_to_number: call.phone_number,
        hs_call_direction: call.incoming === false ? 'OUTBOUND' : 'INBOUND',
        hs_call_status: call.missed === false ? 'COMPLETED' : 'NO_ANSWER',
      };

      if (call.duration) {
        properties.hs_call_duration = call.duration * MIL;
      }

      if (call.outcome_id) {
        properties.hs_call_disposition = callsOutcomes[call.outcome_id];
      }

      if (call.recording_url) {
        properties.hs_call_recording_url = call.recording_url;
      }

      if (call.user_id) {
        properties.hubspot_owner_id = ownersMapping[call.user_id];
      }

      if (call.resource_type) {
        const objectType = resourceType[call.resource_type];
        const dataCoreObject = objectType.path;

        const coreObject = dataCoreObject.find(value =>
          Number(value.zendeskID) === Number(call.resource_id)
        );

        if (!coreObject) {
          callLogger.info(
            `The call ${call.id} doesn't have a core object on Hubspot`,
          );
          addData(PATH_OBJECT_NO_CORE, call);
          continue;
        } else {
          const hubID = coreObject.hubID;

          associations.push(
            setAssociation(hubID, objectType.associationTypeId),
          );
        }
      }

      if (call.associated_deal_ids) {
        const dealType = resourceType['deal'];
        const dataDealObject = dealType.path;
        for (const deal of call.associated_deal_ids) {
          const dealObject = dataDealObject.find(value =>
            Number(value.zendeskID) === Number(deal)
          );

          if (!dealObject) {
            callLogger.info(
              `The call ${call.id} doesn't have a core object on Hubspot`,
            );
            addData(PATH_OBJECT_NO_CORE, call);
            continue;
          } else {
            const hubID = dealObject.hubID;

            associations.push(
              setAssociation(hubID, dealType.associationTypeId),
            );
          }
        }
      }

      if (associations.length === ZERO) {
        callLogger.info(
          `The call ${call.id} doesn't have a core object on Hubspot`,
        );
        addData(PATH_OBJECT_NO_CORE, call);
        continue;
      }

      callLogger.info(
        `The call with Zendesk ID ${call.id} will be ${call.action}`,
      );

      if (call.action === 'create') {
        inputsCreate.push({ properties, associations });
      } else {
        const id = call.hubID;
        inputsUpdate.push({ id, properties, associations });
      }
    }

    if (inputsCreate.length > ZERO) {
      const results = await asyncRetryWithBackoff(
        () =>
          hubspotClient.crm.objects.calls.batchApi.create({
            inputs: inputsCreate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_OBJECTS_MIGRATED, {
          zendeskID: object.properties.hs_call_body
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
          hubspotClient.crm.objects.calls.batchApi.update({
            inputs: inputsUpdate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_OBJECTS_MIGRATED, {
          zendeskID: object.properties.hs_call_body
            .split('-')[ZERO].trim(),
          hubID: object.id,
          action: 'updated',
          timestamp: new Date(),
        });
      }
    }

    callLogger.info(
      `The Batch of calls between the index ${init} and ${end} worked succesfully `,
    );
    return `The Batch of calls between the index ${init} and ${end} worked created succesfully`;
  } catch (error) {
    callLogger.error(
      `Error migrating the batch calls between the index ${init} and ${end} - ${error}`,
    );
    return `The Batch of calls between the index ${init} and ${end} were an error  - ${error} `;
  }
};

const callsMigration = async ({ init, end, batch }) => {
  const data = loadData(PATH_SAVE_DATA);
  const info = data.map(call => call.data);

  const promises = [];

  for (let i = init; i < end; i += batch) {
    const calls = info.slice(i, i + batch);
    promises.push(callsMigrationBatch({ init: i, end: i + batch, calls }));
  }

  const results = await Promise.all(promises);
  console.log({ results });
  callLogger.info({ results });
};

export { callsMigration, countCallsData, getCallsData };
