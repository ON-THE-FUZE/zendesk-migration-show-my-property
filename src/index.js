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

    const next = await rl.question(
      `\nDo you want to run other migration: Yes(1) or No(2)\n`,
    );

    continueMigration = Number(next) === ONE ? true : false;
  } while (continueMigration);

  logger.info(`Thank you`);
  rl.close();
})();
