import { join } from 'desm';
import { readFileSync } from 'node:fs';
import hubspotClient from '../../../../global/hubspot/hubspot.js';
import { leadLogger } from '../../../../global/logger/pino.js';
import mapping from '../../../../global/mapping/mapping.js';
import zendesk from '../../../../global/zendesk/index.js';
import { addData, countData, loadData } from '../../../../utils/jsonSave.js';
import asyncRetryWithBackoff from '../../../../utils/rateLimit.js';

const ZERO = 0;
const ONE = 1;

// Paths
const PATH_SAVE_DATA = join(import.meta.url, '../data/leadsData.json');
const PATH_CONTACTS_MIGRATED = join(
  import.meta.url,
  '../data/leadsMigrated.json',
);

// Models
const leadMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../models/leads.json')),
);

const leadSourceMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../models/leadSource.json')),
);

const leadReasonMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../models/leadUnqualifiedReason.json')),
);

const ownersMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/owners.json')),
);

const companiesNamesIDs = JSON.parse(
  readFileSync(
    join(import.meta.url, '../../../../models/companiesNamesIDs.json'),
  ),
);

const getLeadData = async () => {
  leadLogger.info('Getting the leads from the CRM...');
  let page = 1;
  let count = 0;
  const perPage = 100;

  do {
    try {
      leadLogger.info(`Getting the leads from the page ${page}`);
      const params = {
        page,
        per_page: perPage,
      };

      const response = await asyncRetryWithBackoff(
        zendesk.sell.leads.all.bind(zendesk),
        [params],
      );

      count = response?.meta?.count;
      page++;
      addData(PATH_SAVE_DATA, response?.items);
    } catch (error) {
      leadLogger.error(
        `Error getting the data for the page ${page} - ${error}`,
      );
      continue;
    }
  } while (count !== ZERO);

  return countData(PATH_SAVE_DATA);
};

const countLeadData = () => {
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
        String(existObject.properties[propertyHubspot]).toLowerCase()
          === String(object[propertyZendesk]).toLowerCase(),
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

const leadMigrationBatch = async ({ init, end, leads }) => {
  try {
    const inputsCreate = [];
    const inputsUpdate = [];

    const mapEmails = leads.reduce((acc, lead) => {
      if (lead.email) {
        acc.push({ id: lead.email });
      }
      return acc;
    }, []);

    const reviewByEmail = await filterExistingObjects({
      propertyZendesk: 'email',
      propertyHubspot: 'email',
      inputs: mapEmails,
      data: leads,
    });

    const mapZendeskID = leads.map((lead) => {
      return {
        id: lead.id,
      };
    });

    const dataToEvaluate = await filterExistingObjects({
      propertyZendesk: 'id',
      propertyHubspot: 'zendesk__id',
      inputs: mapZendeskID,
      data: reviewByEmail,
    });

    for (const lead of dataToEvaluate) {
      const associations = [];

      let properties = null;
      properties = mapping(leadMapping, lead);

      if (lead.owner_id) {
        properties.hubspot_owner_id = ownersMapping[lead.owner_id];
      }

      if (lead.source_id) {
        properties.lead_source = leadSourceMapping[lead.source_id];
      }

      if (lead.unqualified_reason_id) {
        properties.lead_unqualified_reason =
          leadReasonMapping[lead.unqualified_reason_id];
      }

      const companyID = companiesNamesIDs.find(company =>
        company.name === lead.organization_name
      )?.hubID;

      if (companyID) {
        associations.push({
          to: {
            id: Number(companyID),
          },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 279,
            },
          ],
        });
      }

      properties.lifecyclestage = 'lead';

      leadLogger.info(
        `The lead with Zendesk ID ${lead.id} will be ${lead.action}`,
      );

      if (lead.action === 'create') {
        inputsCreate.push({ properties, associations });
      } else {
        const id = lead.hubID;
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

    leadLogger.info(
      `The Batch of leads between the index ${init} and ${end} worked succesfully `,
    );
    return `The Batch of leads between the index ${init} and ${end} worked created succesfully`;
  } catch (error) {
    leadLogger.error(
      `Error migrating the batch leads between the index ${init} and ${end} - ${error}`,
    );
    return `The Batch of leads between the index ${init} and ${end} were an error  - ${error} `;
  }
};

const leadMigration = async ({ init, end, batch }) => {
  const data = loadData(PATH_SAVE_DATA);
  const info = data.map(lead => lead.data);

  const promises = [];

  for (let i = init; i < end; i += batch) {
    const leads = info.slice(i, i + batch);
    promises.push(leadMigrationBatch({ init: i, end: i + batch, leads }));
  }

  const results = await Promise.all(promises);
  console.log({ results });
  leadLogger.info({ results });
};

export { countLeadData, getLeadData, leadMigration };
