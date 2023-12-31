import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import { logger } from './global/logger/pino.js';
import {
  callsMigration,
  countCallsData,
  getCallsData,
} from './objects/activities/calls/logic/index.js';
import {
  countNotesData,
  getNotesData,
  notesMigration,
} from './objects/activities/notes/logic/index.js';
import {
  countTasksData,
  getTasksData,
  tasksMigration,
} from './objects/activities/tasks/logic/index.js';
import {
  companyMigration,
  countCompanyData,
  getCompanyData,
} from './objects/core/companies/logic/index.js';
import {
  contactMigration,
  countContactData,
  getContactData,
} from './objects/core/contacts/logic/index.js';
import {
  countDealData,
  dealMigration,
  getDealData,
} from './objects/core/deal/logic/index.js';
import {
  countLeadData,
  getLeadData,
  leadMigration,
} from './objects/core/leads/logic/index.js';

const rl = readline.createInterface({
  input,
  output,
});

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const HUNDRED = 100;

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
    case companyOption: {
      if (getExternalData) {
        totalValues = await getCompanyData();
      } else {
        totalValues = countCompanyData();
      }

      logger.info(`In total we have ${totalValues} companies to migrate`);
      break;
    }
    case leadsOption: {
      if (getExternalData) {
        totalValues = await getLeadData();
      } else {
        totalValues = countLeadData();
      }

      logger.info(`In total we have ${totalValues} leads to migrate`);
      break;
    }
    case dealsOption: {
      if (getExternalData) {
        totalValues = await getDealData();
      } else {
        totalValues = countDealData();
      }

      logger.info(`In total we have ${totalValues} deals to migrate`);
      break;
    }
    case notesOption: {
      if (getExternalData) {
        totalValues = await getNotesData();
      } else {
        totalValues = countNotesData();
      }

      logger.info(`In total we have ${totalValues} notes to migrate`);
      break;
    }
    case tasksOption: {
      if (getExternalData) {
        totalValues = await getTasksData();
      } else {
        totalValues = countTasksData();
      }

      logger.info(`In total we have ${totalValues} tasks to migrate`);
      break;
    }
    case callsOption: {
      if (getExternalData) {
        totalValues = await getCallsData();
      } else {
        totalValues = countCallsData();
      }

      logger.info(`In total we have ${totalValues} calls to migrate`);
      break;
    }
    default: {
      logger.info(`The option ${objectInput} doesn't exist on the program`);
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
      case companyOption: {
        logger.info(`Start company migration...`);
        await companyMigration({ init, end, batch });
        logger.info(`End company migration...`);
        break;
      }
      case leadsOption: {
        logger.info(`Start lead migration...`);
        await leadMigration({ init, end, batch });
        logger.info(`End lead migration...`);
        break;
      }
      case dealsOption: {
        logger.info(`Start Deal migration...`);
        await dealMigration({ init, end, batch });
        logger.info(`End Deal migration...`);
        break;
      }
      case notesOption: {
        logger.info(`Start Notes migration...`);
        await notesMigration({ init, end, batch });
        logger.info(`End Notes migration...`);
        break;
      }
      case tasksOption: {
        logger.info(`Start Tasks migration...`);
        await tasksMigration({ init, end, batch });
        logger.info(`End Tasks migration...`);
        break;
      }
      case callsOption: {
        logger.info(`Start Calls migration...`);
        await callsMigration({ init, end, batch });
        logger.info(`End Calls migration...`);
        break;
      }
      default: {
        logger.info(`The option ${objectInput} doesn't exist on the programm`);
        break;
      }
    }

    const next = await rl.question(
      `\nDo you want to run other migration: Yes(1) or No(2)\n`,
    );

    continueMigration = Number(next) === ONE ? true : false;
  } while (continueMigration);

  logger.info(`Thank you`);
  rl.close();
})();
