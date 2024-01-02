import axios from 'axios';
import { join } from 'desm';
import { readFileSync } from 'node:fs';
import { leadLogger } from '../../../../global/logger/pino.js';
import config from '../../../../lib/config.js';

const leadsData = JSON.parse(
  readFileSync(join(import.meta.url, '../data/leadsData.json')),
);

const leadsMigrated = JSON.parse(
  readFileSync(join(import.meta.url, '../data/leadsMigrated.json')),
);

const companiesNamesIDs = JSON.parse(
  readFileSync(
    join(import.meta.url, '../../../../models/companiesNamesIDs.json'),
  ),
);

(async () => {
  const hasCompany = leadsData.filter(lead =>
    lead.data.organization_name !== null
  );

  const values = hasCompany.map(lead => {
    const to = companiesNamesIDs.find(company =>
      company.name
        === lead.data.organization_name
    )?.hubID;

    const from = leadsMigrated.find(leadMigrated =>
      Number(leadMigrated.zendeskID) === Number(lead.data.id)
    )?.hubID;

    if (!to || !from) {
      leadLogger.info(
        `The lead ${lead.data.id} has problems - ${to} - ${from}`,
      );
      return null;
    }

    return {
      types: [
        {
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 1,
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
    const filterValues = values.filter(value => value !== null);
    for (let i = 0; i < filterValues.length; i += 10) {
      const data = filterValues.slice(i, i + 10);
      const headers = {
        Authorization: `Bearer ${config.hubspotToken}`,
      };

      const apiResponse = await axios.post(
        'https://api.hubapi.com/crm/v4/associations/contact/company/batch/create',
        { inputs: data },
        { headers },
      );

      leadLogger.info(
        `Associations created for ${i} and ${i + 10} - Lead to Company`,
      );
    }
  } catch (error) {
    leadLogger.error(`Error creating the associations - ${error}`);
  }
})();
