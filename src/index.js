import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import { logger } from './global/logger/pino.js';
import {
  contactMigration,
  countContactData,
  getContactData,
} from './objects/core/contacts/logic/index.js';

const rl = readline.createInterface({
  input,
  output,
});

(async () => {
  const contactOption = 1;
  const companyOption = 2;
  const leadsOption = 3;
  const dealsOption = 4;
  const notesOption = 5;
  const tasksOption = 6;
  const callsOption = 7;

  let totalValues = null;
  let batch = 100;
  let end = 0;
  let init = 0;

  logger.info(
    '------------------ Zendesk Migration - Show My Property --------------',
  );

  const objectInput = await rl.question(
    `\nSelect what Zendesk Object you want to migrate from: Contacts(1), Companies(2), Leads(3), Deals(4), Notes(5), Tasks(6) or Calls(7).\n`,
  );

  const getDataCRM = await rl.question(
    `\nDo you want to acquire information from the CRM type in (1) or if do you want to work with the local version type in (2)\n`,
  );

  const getExternalData = Number(getDataCRM) === ONE ? true : false;

  switch (Number(objectInput)) {
    case contactOption: {
      if (getExternalData) {
        totalValues = await getContactData();
      } else {
        totalValues = countContactData();
      }

      logger.info(`In total we have ${totalValues} contacts to migrate`);
      break;
    }
    default: {
      logger.info(`The option ${objectInput} doesn't exist on the programm`);
      break;
    }
  }

  let continueMigration = true;

  do {
    const startMigration = await rl.question(
      `\nIn total there are ${totalValues} objects, from which one do I want to start (the minimum is 0 and the maximum is ${
        totalValues - TWO
      })?\n`,
    );

    init = Number(startMigration);
    if (init > totalValues - TWO || init < ZERO) {
      init = ZERO;
    }

    const endMigration = await rl.question(
      `\nIn total there are ${totalValues} objects, from which one do I want to end (the minimum is 1 and the maximum is ${totalValues})?\n`,
    );

    end = Number(endMigration);

    if (end > totalValues || end <= ZERO) {
      end = totalValues;
    }

    const defineSize = await rl.question(
      `\nPlease indicate the size of the batches to be migrated (the maximum value is 100)\n`,
    );

    batch = Number(defineSize);

    if (batch > HUNDRED || batch <= ZERO) {
      batch = HUNDRED;
    }

    logger.info(
      `The migration will be done with the next configuration: \n Batch Size: ${batch} \n Start Point: ${init} \n Start Point: ${end}`,
    );

    switch (Number(objectInput)) {
      case contactOption: {
        logger.info(`Start contact migration...`);
        await contactMigration({ init, end, batch });
        logger.info(`End contact migration...`);
        break;
      }
      default: {
        logger.info(`The option ${objectInput} doesn't exist on the programm`);
        break;
      }
    }

    if (selectedOption === contactValue) {
      logger.info(`Start contact migration...`);
      const data = loadData(contactPath);
      for (let i = init; i < end; i += batch) {
        const contacts = data.slice(i, i + batch);
        await contactCreationBatch({ init: i, end: i + batch, contacts });
      }
      logger.info(`End contact migration...`);
    }

    if (selectedOption === emailsValue) {
      logger.info(`Start email migration...`);
      const data = loadData(emailPath);
      const reverseData = data.reverse();
      for (let i = init; i < end; i += batch) {
        const emails = reverseData.slice(i, i + batch);
        await emailCreationBatch({ init: i, end: i + batch, emails });
      }
      logger.info(`End email migration...`);
    }

    if (selectedOption === notesValue) {
      logger.info(`Start notes migration...`);
      const data = loadData(notePath);
      for (let i = init; i < end; i += batch) {
        const notes = data.slice(i, i + batch);
        await noteCreationBatch({ init: i, end: i + batch, notes });
      }
      logger.info(`End notes migration...`);
    }

    const next = await rl.question(
      `\nDo you want to run other migration: Yes(1) or No(2)\n`,
    );

    continueMigration = Number(next) === ONE ? true : false;
  } while (continueMigration);

  logger.info(`Thank you 😊`);
  rl.close();
})();

/*
import { join } from 'desm';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import contactCreationBatch from './contacts/logic/index.js';
import conversationCreation from './conversations/logic/index.js';
import ticketCreationBatch from './tickets/logic/index.js';
import {
  addData,
  countData,
  loadData,
  resetData,
} from './utils/logger/jsonSave.js';

import zendesk from './utils/zendesk/zendesk.js';

const rl = readline.createInterface({
  input,
  output,
});

const contactPath = join(import.meta.url, './contacts/data/contactData.json');
const ticketPath = join(import.meta.url, './tickets/data/ticketsData.json');
const conversationPath = join(
  import.meta.url,
  './conversations/data/conversationsData.json',
);

(async () => {
  try {
    const contactValue = 1;
    const ticketsValue = 2;
    const conversationsValue = 3;
    const ZERO = 0;
    const HUNDRED = 100;
    const ONE = 1;
    const TWO = 2;

    let totalValues = null;
    let batch = 100;
    let end = 0;
    let init = 0;
    let selectedOption = null;

    console.log(
      '------------------ Zendesk Migration - Restaurant System --------------',
    );

    const objectInput = await rl.question(
      `\nSelect what Zendesk Object you want to migrate from: Contacts(1), Tickets(2) or Conversations(3).\n`,
    );

    selectedOption = Number(objectInput);
    switch (selectedOption) {
      case contactValue: {
        console.log('Review the number of data on Zendesk and Local');
        const countContacts = await zendesk.users.get.count({
          role: 'end-user',
        });
        const countLocalData = countData(contactPath);
        if (countContacts.count.value !== countLocalData) {
          console.log(
            'The local version is outdated, we proceed to update it. Wait for a few seconds...',
          );
          resetData(contactPath);
          let nextPage = '';
          let page = 1;
          do {
            /*
            const zendeskData = await zendesk.users.get.users({
              role: 'end-user',
              page,
            });

            const zendeskData = await zendesk.users.get.search({
              query: 'created>2023-10-25',
              page,
            });
            addData(contactPath, zendeskData.users);
            nextPage = zendeskData.next_page;
            page++;
          } while (nextPage !== null);

          totalValues = countData(contactPath);
          console.log(`In Total ${totalValues} objects were saved`);
        } else {
          totalValues = countContacts.count.value;
          console.log(
            `Local version is up to date, we found ${totalValues} objects`,
          );
        }
        break;
      }

      case ticketsValue: {
        console.log('Review the number of data on Zendesk and Local');
        const countTickets = 16776;
        const countLocalData = countData(ticketPath);
        if (countTickets !== countLocalData) {
          console.log(
            'The local version is outdated, we proceed to update it. Wait for a few seconds...',
          );
          resetData(ticketPath);

          const zendeskData = await zendesk.tickets.get.cursor({
            start_time: '1698278400',
          });
          addData(ticketPath, zendeskData.tickets);
          let after = zendeskData.after_cursor;

          while (after !== null) {
            const zendeskData = await zendesk.tickets.get.cursor({
              start_time: '1698278400',
              cursor: after,
            });
            addData(ticketPath, zendeskData.tickets);
            after = zendeskData.after_cursor;
          }

          totalValues = countData(ticketPath);
          console.log(`In Total ${totalValues} objects were saved`);
        } else {
          totalValues = countData(ticketPath);
          console.log(
            `Local version is up to date, we found ${totalValues} objects`,
          );
        }
        break;
      }

      case conversationsValue: {
        console.log('Review the number of Tickets between 2022 and 2023');
        resetData(conversationPath);

        const zendeskData = await zendesk.tickets.get.cursor({
          start_time: '1640995200',
        });

        const ticketsIDs = zendeskData.tickets.map((ticket) => {
          return {
            id: ticket.id,
            name: ticket.subject,
            assignee: ticket.assignee_id,
          };
        });

        addData(conversationPath, ticketsIDs);

        let after = zendeskData.after_cursor;

        while (after !== null) {
          const zendeskData = await zendesk.tickets.get.cursor({
            start_time: '1640995200',
            cursor: after,
          });

          const ticketsIDs = zendeskData.tickets.map((ticket) => {
            return {
              id: ticket.id,
              name: ticket.subject,
              assignee: ticket.assignee_id,
            };
          });

          addData(conversationPath, ticketsIDs);
          after = zendeskData.after_cursor;
        }

        totalValues = countData(conversationPath);
        console.log(`In Total ${totalValues} objects were saved`);

        break;
      }
    }

    let continueMigration = true;

    do {
      const startMigration = await rl.question(
        `\nIn total there are ${totalValues} objects, from which one do I want to start (the minimum is 0 and the maximum is ${
          totalValues - TWO
        })?\n`,
      );

      const start = Number(startMigration);
      init = start;
      if (start > totalValues - TWO || start < ZERO) {
        init = ZERO;
      }

      const endMigration = await rl.question(
        `\nIn total there are ${totalValues} objects, from which one do I want to end (the minimum is 1 and the maximum is ${totalValues})?\n`,
      );

      const end = Number(endMigration);
      end = end;
      if (end > totalValues || end <= ZERO) {
        end = totalValues;
      }

      const defineSize = await rl.question(
        `\nPlease indicate the size of the batches to be migrated (the maximum value is 100)\n`,
      );

      const size = Number(defineSize);
      batch = size;
      if (size > HUNDRED || size <= ZERO) {
        batch = HUNDRED;
      }

      console.log(
        `The migration will be done with the next configuration: \n Batch Size: ${batch} \n Start Point: ${init} \n Start Point: ${end}`,
      );

      if (selectedOption === contactValue) {
        console.log(`Start contact migration...`);
        const data = loadData(contactPath);
        for (let i = init; i < end; i += batch) {
          const contacts = data.slice(i, i + batch);
          await contactCreationBatch({ init: i, end: i + batch, contacts });
        }
        console.log(`End contact migration...`);
      }

      if (selectedOption === ticketsValue) {
        console.log(`Start tickets migration...`);
        const data = loadData(ticketPath);
        for (let i = init; i < end; i += batch) {
          const tickets = data.slice(i, i + batch);
          await ticketCreationBatch({ init: i, end: i + batch, tickets });
        }
        console.log(`End tickets migration...`);
      }

      if (selectedOption === conversationsValue) {
        console.log(`Start conversations migration...`);
        const data = loadData(conversationPath);
        for (let i = init; i < end; i += batch) {
          const tickets = data.slice(i, i + batch);
          await conversationCreation({
            init: i,
            end: i + batch,
            tickets,
          });
        }
        console.log(`End conversations migration...`);
      }

      const next = await rl.question(
        `\nDo you want to run other migration: Yes(1) or No(2)\n`,
      );

      continueMigration = Number(next) === ONE ? true : false;
    } while (continueMigration);

    console.log(`Good Day. Thank you`);
    rl.close();
  } catch (error) {
    console.error(`Error on the migration process - ${error}`);
  }
})();

*/
