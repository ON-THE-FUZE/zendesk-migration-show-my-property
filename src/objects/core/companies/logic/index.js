import { join } from 'desm';
import { readFileSync } from 'node:fs';
import hubspotClient from '../../../../global/hubspot/hubspot.js';
import { companyLogger } from '../../../../global/logger/pino.js';
import mapping from '../../../../global/mapping/mapping.js';
import zendesk from '../../../../global/zendesk/index.js';
import { addData, countData, loadData } from '../../../../utils/jsonSave.js';
import asyncRetryWithBackoff from '../../../../utils/rateLimit.js';

const ZERO = 0;

// Paths
const PATH_SAVE_DATA = join(import.meta.url, '../data/companiesData.json');
const PATH_COMPANIES_MIGRATED = join(
  import.meta.url,
  '../data/companiesMigrated.json',
);

// Models
const companyMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../models/company.json')),
);

const ownersMapping = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/owners.json')),
);

const getCompanyData = async () => {
  companyLogger.info('Getting the companies from the CRM...');
  let page = 1;
  let count = 0;
  const isOrganization = true;
  const perPage = 100;

  do {
    try {
      companyLogger.info(`Getting the companies from the page ${page}`);
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
      companyLogger.error(
        `Error getting the data for the page ${page} - ${error}`,
      );
      continue;
    }
  } while (count !== ZERO);

  return countData(PATH_SAVE_DATA);
};

const countCompanyData = () => {
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
    () => hubspotClient.crm.companies.batchApi.read(objectToReview, false),
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

const companyMigrationBatch = async ({ init, end, companies }) => {
  try {
    const inputsCreate = [];
    const inputsUpdate = [];

    const mapDomains = companies.reduce((acc, company) => {
      if (company.website) {
        try {
          const url = new URL(company.website);
          acc.push({ id: url.hostname });
        } catch (error) {
          return acc;
        }
      }
      return acc;
    }, []);

    const reviewByDomain = await filterExistingObjects({
      propertyZendesk: 'website',
      propertyHubspot: 'domain',
      inputs: mapDomains,
      data: companies,
    });

    const mapZendeskID = companies.map((company) => {
      return {
        id: company.id,
      };
    });

    const dataToEvaluate = await filterExistingObjects({
      propertyZendesk: 'id',
      propertyHubspot: 'zendesk_id',
      inputs: mapZendeskID,
      data: reviewByDomain,
    });

    for (const company of dataToEvaluate) {
      const associations = [];

      let properties = null;
      properties = mapping(companyMapping, company);

      if (company.owner_id) {
        properties.hubspot_owner_id = ownersMapping[company.owner_id];
      }

      if (company.website) {
        try {
          const url = new URL(company.website);
          properties.domain = url.hostname;
        } catch (error) {
          companyLogger.warn(
            `The company ${company.id} doesn't have a valid website`,
          );
        }
      }

      companyLogger.info(
        `The company with Zendesk ID ${company.id} will be ${company.action}`,
      );

      if (company.action === 'create') {
        inputsCreate.push({ properties, associations });
      } else {
        const id = company.hubID;
        inputsUpdate.push({ id, properties, associations });
      }
    }

    if (inputsCreate.length > ZERO) {
      const results = await asyncRetryWithBackoff(
        () =>
          hubspotClient.crm.companies.batchApi.create({
            inputs: inputsCreate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_COMPANIES_MIGRATED, {
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
          hubspotClient.crm.companies.batchApi.update({
            inputs: inputsUpdate,
          }),
        [],
      );

      for (const object of results.results) {
        addData(PATH_COMPANIES_MIGRATED, {
          zendeskID: object.properties.zendesk_id,
          hubID: object.id,
          action: 'updated',
          timestamp: new Date(),
        });
      }
    }

    companyLogger.info(
      `The Batch of companys between the index ${init} and ${end} worked succesfully `,
    );
    return `The Batch of companys between the index ${init} and ${end} worked created succesfully`;
  } catch (error) {
    companyLogger.error(
      `Error migrating the batch companys - ${error}`,
    );
    return `The Batch of companys between the index ${init} and ${end} were an error - ${error} `;
  }
};

const companyMigration = async ({ init, end, batch }) => {
  const data = loadData(PATH_SAVE_DATA);
  const info = data.map(company => company.data);

  const promises = [];

  for (let i = init; i < end; i += batch) {
    const companies = info.slice(i, i + batch);
    promises.push(
      companyMigrationBatch({ init: i, end: i + batch, companies }),
    );
  }

  const results = await Promise.all(promises);
  console.log({ results });
};

export { companyMigration, countCompanyData, getCompanyData };
