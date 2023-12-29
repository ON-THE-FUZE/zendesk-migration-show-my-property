import { join } from 'desm';
import { readFileSync } from 'node:fs';
import hubspotClient from '../../../../global/hubspot/hubspot.js';
import { contactLogger } from '../../../../global/logger/pino.js';
import mapping from '../../../../global/mapping/mapping.js';
import zendesk from '../../../../global/zendesk/index.js';
import { addData, countData, loadData } from '../../../../utils/jsonSave.js';
import asyncRetryWithBackoff from '../../../../utils/rateLimit.js';

const ZERO = 0;
const ONE = 1;

// Paths
const PATH_SAVE_DATA = join(import.meta.url, '../data/contactData.json');
const PATH_CONTACTS_MIGRATED = join(
  import.meta.url,
  '../data/contactsMigrated.json',
);

// Models
const contactMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../models/contact.json')),
);

const ownersMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/owners.json')),
);

const getContactData = async () => {
  contactLogger.info('Getting the contacts from the CRM...');
  let page = 1;
  let count = 0;
  const isOrganization = false;
  const perPage = 100;

  do {
    try {
      contactLogger.info(`Getting the contacts from the page ${page}`);
      const params = {
        page,
        is_organization: isOrganization,
        per_page: perPage,
      };

      const response = await asyncRetryWithBackoff(
        zendesk.sell.contacts.all.bind(zendesk),
        [params],
      );

      count = response?.meta?.count;
      page++;
      addData(PATH_SAVE_DATA, response?.items);
    } catch (error) {
      contactLogger.error(
        `Error getting the data for the page ${page} - ${error}`,
      );
      continue;
    }
  } while (count !== ZERO);

  return countData(PATH_SAVE_DATA);
};

const countContactData = () => {
  return countData(PATH_SAVE_DATA);
};

const filterExistingObjects = async ({
  propertyZendesk,
  propertyHubspot,
  inputs,
  data,
}) => {
  const objectToReview = {
    idProperty: propertyHubspot,
    inputs,
  };

  const existingObjects = await asyncRetryWithBackoff(
    () => hubspotClient.crm.contacts.batchApi.read(objectToReview, false),
    [],
  );

  if (existingObjects.results.length === ZERO) {
    data.forEach((object) => {
      if (!object.action) {
        object.action = 'create';
      }
    });
    return data;
  }

  return data.map((object) => {
    const exist = existingObjects.results.find(
      (existObject) =>
        String(existObject.properties[propertyHubspot])
          === String(object[propertyZendesk]),
    );

    if (exist) {
      object.action = 'update';
      object.hubID = exist.id;
    } else {
      if (object.action !== 'update') {
        object.action = 'create';
      }
    }

    return object;
  });
};

const contactMigrationBatch = async ({ init, end, contacts }) => {
  try {
    const inputsCreate = [];
    const inputsUpdate = [];

    const mapEmails = contacts.reduce((acc, contact) => {
      if (contact.email) {
        acc.push({ id: contact.email });
      }
      return acc;
    }, []);

    const reviewByEmail = await filterExistingObjects({
      propertyZendesk: 'email',
      propertyHubspot: 'email',
      inputs: mapEmails,
      data: contacts,
    });

    const mapZendeskID = contacts.map((contact) => {
      return {
        id: contact.id,
      };
    });

    const dataToEvaluate = await filterExistingObjects({
      propertyZendesk: 'id',
      propertyHubspot: 'zendesk__id',
      inputs: mapZendeskID,
      data: reviewByEmail,
    });

    for (const contact of dataToEvaluate) {
      const associations = [];

      let properties = null;
      properties = mapping(contactMapping, contact);

      if (contact.owner_id) {
        properties.hubspot_owner_id = ownersMapping[contact.owner_id];
      }

      if (!properties.firstname || !properties.lastname) {
        const fullName = contact.name;
        const spaceIndex = fullName.indexOf(' ');
        properties.firstname = fullName.substring(ZERO, spaceIndex);
        properties.lastname = fullName.substring(spaceIndex + ONE);
      }

      if (contact.parent_organization_id) {
        associations.push({
          to: {
            id: organizationsMapping[contact.parent_organization_id],
          },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 279,
            },
          ],
        });
      }

      contactLogger.info(
        `The contact with Zendesk ID ${contact.id} will be ${contact.action}`,
      );

      if (contact.action === 'create') {
        inputsCreate.push({ properties, associations });
      } else {
        const id = contact.hubID;
        inputsUpdate.push({ id, properties, associations });
      }
    }

    if (inputsCreate.length > ZERO) {
      const results = await asyncRetryWithBackoff(
        () =>
          hubspotClient.crm.contacts.batchApi.create({
            inputs: inputsCreate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_CONTACTS_MIGRATED, {
          zendeskID: object.properties.zendesk__id,
          hubID: object.id,
          action: 'created',
          timestamp: new Date(),
        });
      }
    }

    if (inputsUpdate.length > ZERO) {
      const results = await asyncRetryWithBackoff(
        () =>
          hubspotClient.crm.contacts.batchApi.update({
            inputs: inputsUpdate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_CONTACTS_MIGRATED, {
          zendeskID: object.properties.zendesk__id,
          hubID: object.id,
          action: 'updated',
          timestamp: new Date(),
        });
      }
    }

    contactLogger.info(
      `The Batch of contacts between the index ${init} and ${end} worked succesfully `,
    );
    return `The Batch of contacts between the index ${init} and ${end} worked created succesfully`;
  } catch (error) {
    contactLogger.error(
      `Error migrating the batch contacts - ${error}`,
    );
    return `The Batch of contacts between the index ${init} and ${end} were an error  - ${error} `;
  }
};

const contactMigration = async ({ init, end, batch }) => {
  const data = loadData(PATH_SAVE_DATA);
  const info = data.map(contact => contact.data);

  const promises = [];

  for (let i = init; i < end; i += batch) {
    const contacts = info.slice(i, i + batch);
    promises.push(contactMigrationBatch({ init: i, end: i + batch, contacts }));
  }

  const results = await Promise.all(promises);
  console.log({ results });
};

export { contactMigration, countContactData, getContactData };
