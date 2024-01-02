import { join } from 'desm';
import { readFileSync } from 'node:fs';
import hubspotClient from '../../../../global/hubspot/hubspot.js';
import { dealLogger } from '../../../../global/logger/pino.js';
import mapping from '../../../../global/mapping/mapping.js';
import zendesk from '../../../../global/zendesk/index.js';
import { addData, countData, loadData } from '../../../../utils/jsonSave.js';
import asyncRetryWithBackoff from '../../../../utils/rateLimit.js';

const ZERO = 0;
const CLOSED_WON = 117603;

// Paths
const PATH_SAVE_DATA = join(import.meta.url, '../data/dealsData.json');
const PATH_CONTACTS_MIGRATED = join(
  import.meta.url,
  '../data/dealsMigrated.json',
);

// Models
const dealMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../models/deals.json')),
);

const dealSourceMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../models/dealSource.json')),
);

const dealReasonMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../models/dealUnqualifiedReason.json')),
);

const dealStage = JSON.parse(
  readFileSync(join(import.meta.url, '../models/dealStage.json')),
);

const dealLostReason = JSON.parse(
  readFileSync(join(import.meta.url, '../models/dealLostReason.json')),
);

const ownersMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/owners.json')),
);

const companiesIDs = JSON.parse(
  readFileSync(
    join(import.meta.url, '../../../../models/companiesIDs.json'),
  ),
);

const contactsIDs = JSON.parse(
  readFileSync(
    join(import.meta.url, '../../../../models/contactsIDs.json'),
  ),
);

const getDealData = async () => {
  dealLogger.info('Getting the deals from the CRM...');
  let page = 1;
  let count = 0;
  const perPage = 100;

  do {
    try {
      dealLogger.info(`Getting the deals from the page ${page}`);
      const params = {
        page,
        per_page: perPage,
      };

      const response = await asyncRetryWithBackoff(
        zendesk.sell.deals.all.bind(zendesk),
        [params],
      );

      count = response?.meta?.count;
      page++;
      addData(PATH_SAVE_DATA, response?.items);
    } catch (error) {
      dealLogger.error(
        `Error getting the data for the page ${page} - ${error}`,
      );
      continue;
    }
  } while (count !== ZERO);

  return countData(PATH_SAVE_DATA);
};

const countDealData = () => {
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
    () => hubspotClient.crm.deals.batchApi.read(objectToReview, false),
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

const dealMigrationBatch = async ({ init, end, deals }) => {
  try {
    const inputsCreate = [];
    const inputsUpdate = [];

    const mapZendeskID = deals.map((deal) => {
      return {
        id: deal.id,
      };
    });

    const dataToEvaluate = await filterExistingObjects({
      propertyZendesk: 'id',
      propertyHubspot: 'zendesk_id',
      inputs: mapZendeskID,
      data: deals,
    });

    for (const deal of dataToEvaluate) {
      const associations = [];

      let properties = null;
      properties = mapping(dealMapping, deal);

      if (deal.owner_id) {
        properties.hubspot_owner_id = ownersMapping[deal.owner_id];
      }

      if (deal.source_id) {
        properties.source = dealSourceMapping[deal.source_id];
      }

      if (deal.unqualified_reason_id) {
        properties.deal_unqualified_reason =
          dealReasonMapping[deal.unqualified_reason_id];
      }

      if (deal.loss_reason_id) {
        properties.closed_lost_reason = dealLostReason[deal.loss_reason_id];
      }

      if (deal.stage_id) {
        properties.dealstage = dealStage[deal.stage_id];
        if (deal.stage_id === CLOSED_WON) {
          properties.closedate = Date.parse(deal.last_stage_change_at);
        }
      }

      const companyID = companiesIDs.find(company =>
        Number(company.zendeskID) === Number(deal.organization_id)
      )?.hubID;

      if (companyID) {
        associations.push({
          to: {
            id: Number(companyID),
          },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 5,
            },
          ],
        });
      }

      const contactID = contactsIDs.find(contact =>
        Number(contact.zendeskID) === Number(deal.contact_id)
      )?.hubID;

      if (contactID) {
        associations.push({
          to: {
            id: Number(contactID),
          },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 3,
            },
          ],
        });
      }

      dealLogger.info(
        `The deal with Zendesk ID ${deal.id} will be ${deal.action}`,
      );

      if (deal.action === 'create') {
        inputsCreate.push({ properties, associations });
      } else {
        const id = deal.hubID;
        inputsUpdate.push({ id, properties, associations });
      }
    }

    if (inputsCreate.length > ZERO) {
      const results = await asyncRetryWithBackoff(
        () =>
          hubspotClient.crm.deals.batchApi.create({
            inputs: inputsCreate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_CONTACTS_MIGRATED, {
          zendeskID: object.properties.zendesk_id,
          hubID: object.id,
          action: 'created',
          timestamp: new Date(),
        });
      }
    }

    if (inputsUpdate.length > ZERO) {
      const results = await asyncRetryWithBackoff(
        () =>
          hubspotClient.crm.deals.batchApi.update({
            inputs: inputsUpdate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_CONTACTS_MIGRATED, {
          zendeskID: object.properties.zendesk_id,
          hubID: object.id,
          action: 'updated',
          timestamp: new Date(),
        });
      }
    }

    dealLogger.info(
      `The Batch of deals between the index ${init} and ${end} worked succesfully `,
    );
    return `The Batch of deals between the index ${init} and ${end} worked created succesfully`;
  } catch (error) {
    dealLogger.error(
      `Error migrating the batch deals between the index ${init} and ${end} - ${error}`,
    );
    return `The Batch of deals between the index ${init} and ${end} were an error  - ${error} `;
  }
};

const dealMigration = async ({ init, end, batch }) => {
  const data = loadData(PATH_SAVE_DATA);
  const info = data.map(deal => deal.data);

  const promises = [];

  for (let i = init; i < end; i += batch) {
    const deals = info.slice(i, i + batch);
    promises.push(dealMigrationBatch({ init: i, end: i + batch, deals }));
  }

  const results = await Promise.all(promises);
  console.log({ results });
  dealLogger.info({ results });
};

export { countDealData, dealMigration, getDealData };
