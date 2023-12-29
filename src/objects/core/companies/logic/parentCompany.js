import axios from 'axios';
import { join } from 'desm';
import { readFileSync } from 'node:fs';
import { companyLogger } from '../../../../global/logger/pino.js';
import config from '../../../../lib/config.js';

const companiesData = JSON.parse(
  readFileSync(join(import.meta.url, '../data/companiesData.json')),
);
const companiesIDs = JSON.parse(
  readFileSync(join(import.meta.url, '../../../../models/companiesIDs.json')),
);

(async () => {
  const objectType = '0-2';

  const hasParentCompany = companiesData.filter(company =>
    company.data.parent_organization_id !== null
  );

  const values = hasParentCompany.map(company => {
    const to = companiesIDs.find(companyMigrated =>
      Number(companyMigrated.zendeskID)
        === Number(company.data.parent_organization_id)
    ).hubID;
    const from = companiesIDs.find(companyMigrated =>
      Number(companyMigrated.zendeskID) === Number(company.data.id)
    ).hubID;

    return {
      types: [
        {
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 14,
        },
      ],
      from: {
        id: from,
      },
      to: {
        id: to,
      },
    };
  });

  try {
    for (let i = 0; i < values.length; i += 10) {
      const data = values.slice(i, i + 10);
      const headers = {
        Authorization: `Bearer ${config.hubspotToken}`,
      };

      const apiResponse = await axios.post(
        'https://api.hubapi.com/crm/v4/associations/company/company/batch/create',
        { inputs: data },
        { headers },
      );

      console.log(`Associations created for ${i} and ${i + 10}`);
    }
  } catch (error) {
    companyLogger.error(`Error creating the associations - ${error}`);
  }
})();
