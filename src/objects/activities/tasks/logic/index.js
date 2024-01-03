import { join } from 'desm';
import { readFileSync } from 'node:fs';
import hubspotClient from '../../../../global/hubspot/hubspot.js';
import { taskLogger } from '../../../../global/logger/pino.js';
import zendesk from '../../../../global/zendesk/index.js';
import { addData, countData, loadData } from '../../../../utils/jsonSave.js';
import asyncRetryWithBackoff from '../../../../utils/rateLimit.js';

const ZERO = 0;
const ONE = 1;

// Paths
const PATH_SAVE_DATA = join(import.meta.url, '../data/tasksData.json');
const PATH_OBJECTS_MIGRATED = join(
  import.meta.url,
  '../data/tasksMigrated.json',
);
const PATH_OBJECT_NO_CORE = join(
  import.meta.url,
  '../data/tasksWithoutCoreObject.json',
);

// Models
const ownersMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/owners.json')),
);

const contactsIDs = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/contactsIDs.json')),
);

const companiesIDs = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/companiesIDs.json')),
);

const dealsIDs = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/dealsIDs.json')),
);

const resourceType = {
  lead: {
    path: contactsIDs,
    associationTypeId: 204,
  },
  contact: {
    path: contactsIDs,
    associationTypeId: 204,
  },
  deal: {
    path: dealsIDs,
    associationTypeId: 216,
  },
};

const getTasksData = async () => {
  taskLogger.info('Getting the tasks from the CRM...');
  let page = 1;
  let count = 0;
  const perPage = 100;

  do {
    try {
      taskLogger.info(`Getting the tasks from the page ${page}`);
      const params = {
        page,
        per_page: perPage,
      };

      const response = await asyncRetryWithBackoff(
        zendesk.sell.tasks.all.bind(zendesk),
        [params],
      );

      count = response?.meta?.count;
      page++;
      addData(PATH_SAVE_DATA, response?.items);
    } catch (error) {
      taskLogger.error(
        `Error getting the data for the page ${page} - ${error}`,
      );
      continue;
    }
  } while (count !== ZERO);

  return countData(PATH_SAVE_DATA);
};

const countTasksData = () => {
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

const tasksMigrationBatch = async ({ init, end, tasks }) => {
  try {
    const inputsCreate = [];
    const inputsUpdate = [];

    const dataToEvaluate = await filterExistingObjects(tasks);

    for (const task of dataToEvaluate) {
      const associations = [];

      let properties = null;

      properties = {
        hs_timestamp: Date.parse(task.due_date),
        hs_task_body: `${task.id} - ${task.content}`,
        hs_task_status: task.completed === false ? 'NOT_STARTED' : 'COMPLETED',
      };

      if (task.owner_id) {
        properties.hubspot_owner_id = ownersMapping[task.owner_id];
      }

      if (task.resource_type) {
        const objectType = resourceType[task.resource_type];
        const dataCoreObject = objectType.path;

        const coreObject = dataCoreObject.find(value =>
          Number(value.zendeskID) === Number(task.resource_id)
        );

        if (!coreObject) {
          const companyObject = companiesIDs.find(value =>
            Number(value.zendeskID) === Number(task.resource_id)
          );

          if (!companyObject) {
            taskLogger.info(
              `The task ${task.id} doesn't have a core object on Hubspot`,
            );
            addData(PATH_OBJECT_NO_CORE, task);
            continue;
          } else {
            const hubID = companyObject.hubID;

            associations.push(
              setAssociation(hubID, '192'),
            );
          }
        } else {
          const hubID = coreObject.hubID;

          associations.push(
            setAssociation(hubID, objectType.associationTypeId),
          );
        }
      }

      taskLogger.info(
        `The task with Zendesk ID ${task.id} will be ${task.action}`,
      );

      if (task.action === 'create') {
        inputsCreate.push({ properties, associations });
      } else {
        const id = task.hubID;
        inputsUpdate.push({ id, properties, associations });
      }
    }

    if (inputsCreate.length > ZERO) {
      const results = await asyncRetryWithBackoff(
        () =>
          hubspotClient.crm.objects.tasks.batchApi.create({
            inputs: inputsCreate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_OBJECTS_MIGRATED, {
          zendeskID: object.properties.hs_task_body
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
          hubspotClient.crm.objects.tasks.batchApi.update({
            inputs: inputsUpdate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_OBJECTS_MIGRATED, {
          zendeskID: object.properties.hs_task_body
            .split('-')[ZERO].trim(),
          hubID: object.id,
          action: 'updated',
          timestamp: new Date(),
        });
      }
    }

    taskLogger.info(
      `The Batch of tasks between the index ${init} and ${end} worked succesfully `,
    );
    return `The Batch of tasks between the index ${init} and ${end} worked created succesfully`;
  } catch (error) {
    taskLogger.error(
      `Error migrating the batch tasks between the index ${init} and ${end} - ${error}`,
    );
    return `The Batch of tasks between the index ${init} and ${end} were an error  - ${error} `;
  }
};

const tasksMigration = async ({ init, end, batch }) => {
  const data = loadData(PATH_SAVE_DATA);
  const info = data.map(task => task.data);

  const promises = [];

  for (let i = init; i < end; i += batch) {
    const tasks = info.slice(i, i + batch);
    promises.push(tasksMigrationBatch({ init: i, end: i + batch, tasks }));
  }

  const results = await Promise.all(promises);
  console.log({ results });
  taskLogger.info({ results });
};

export { countTasksData, getTasksData, tasksMigration };
