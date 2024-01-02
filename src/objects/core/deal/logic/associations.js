import axios from 'axios';
import { join } from 'desm';
import { readFileSync } from 'node:fs';
import { dealLogger } from '../../../../global/logger/pino.js';
import zendesk from '../../../../global/zendesk/index.js';
import config from '../../../../lib/config.js';
import { addData, loadData } from '../../../../utils/jsonSave.js';
import asyncRetryWithBackoff from '../../../../utils/rateLimit.js';

const ZERO = 0;

const dealsData = JSON.parse(
  readFileSync(join(import.meta.url, '../data/dealsData.json')),
);

const dealsMigrated = JSON.parse(
  readFileSync(join(import.meta.url, '../data/dealsMigrated.json')),
);

const dealAssociations = join(
  import.meta.url,
  '../data/dealsContactAssociation.json',
);

const contactsIDs = JSON.parse(
  readFileSync(
    join(import.meta.url, '../../../../models/contactsIDs.json'),
  ),
);

(async () => {
  /*
  // Get the Data
  for (const deal of dealsData) {
    const response = await asyncRetryWithBackoff(
      zendesk.sell.deals.associatedContacts.bind(zendesk),
      [deal.data.id],
    );
    dealLogger.info(`Getting data from deal ${deal.data.id}`);

    addData(dealAssociations, {
      dealId: deal.data.id,
      ...response,
    });
  }
*/
  const dealInfo = loadData(dealAssociations);

  const data = dealInfo.filter(deal => deal.items.length !== ZERO);

  const values = data.map(deal => {
    const items = deal.items;
    const associations = [];

    for (const item of items) {
      const to = contactsIDs.find(contact =>
        Number(contact.zendeskID)
          === Number(item.data.contact_id)
      )?.hubID;

      const from = dealsMigrated.find(dealMigrated =>
        Number(dealMigrated.zendeskID) === Number(deal.dealId)
      )?.hubID;

      if (!to || !from) {
        dealLogger.info(
          `The deal ${deal.dealId} has problems - ${to} - ${from}`,
        );
        return null;
      }

      associations.push({
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 3,
          },
        ],
        from: {
          id: from,
        },
        to: {
          id: to,
        },
      });
    }

    return associations;
  });

  try {
    const filterValues = values.flat(Infinity).filter(value => value !== null);
    for (let i = 0; i < filterValues.length; i += 10) {
      const data = filterValues.slice(i, i + 10);
      const headers = {
        Authorization: `Bearer ${config.hubspotToken}`,
      };

      const apiResponse = await axios.post(
        'https://api.hubapi.com/crm/v4/associations/deal/contact/batch/create',
        { inputs: data },
        { headers },
      );

      dealLogger.info(
        `Associations created for ${i} and ${i + 10} - Lead to Company`,
      );
    }
  } catch (error) {
    dealLogger.error(`Error creating the associations - ${error}`);
  }
})();
