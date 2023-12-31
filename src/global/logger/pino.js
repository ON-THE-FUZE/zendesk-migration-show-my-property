import { join } from 'desm';
import pino from 'pino';

/**
 * TODO: Update all the paths that you need to save the logs on the migration
 *
 * **/
const errorPath = join(import.meta.url, './logs/error.mjs');
const successPath = join(import.meta.url, './logs/success.mjs');

const transport = pino.transport({
  targets: [
    {
      level: 'info',
      target: 'pino/file',
      options: { destination: successPath },
    },
    {
      level: 'error',
      target: 'pino/file',
      options: { destination: errorPath },
    },
    {
      target: 'pino-pretty',
      options: { destination: 1 }, // use 2 for stderr
    },
  ],
});

const logger = pino(transport);
const contactLogger = logger.child({ object: 'contact' });
const companyLogger = logger.child({ object: 'company' });
const leadLogger = logger.child({ object: 'lead' });
const dealLogger = logger.child({ object: 'deal' });
const noteLogger = logger.child({ object: 'note' });
const callLogger = logger.child({ object: 'call' });
const taskLogger = logger.child({ object: 'task' });

export {
  callLogger,
  companyLogger,
  contactLogger,
  dealLogger,
  leadLogger,
  logger,
  noteLogger,
  taskLogger
};
