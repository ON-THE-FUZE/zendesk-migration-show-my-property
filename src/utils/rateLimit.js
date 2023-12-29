import { logger } from '../global/logger/pino.js';

const MAX_RETRY = 10;
const INIT_TIME = 1000;
const RATE_LIMIT_ERROR = 429;
const MILI = 1000;
const ONE = 1;
const TWO = 2;

function calculateWaitTime(retry, initTime) {
  return initTime * TWO ** (retry - ONE);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function asyncRetryWithBackoff(
  fn,
  args,
  maxRetry = MAX_RETRY,
  initTime = INIT_TIME,
) {
  let retry = 1;

  while (retry < maxRetry) {
    try {
      return await fn(...args);
    } catch (error) {
      if ((error.status === RATE_LIMIT_ERROR || error.code === RATE_LIMIT_ERROR) && retry < maxRetry) {
        const waitTime = calculateWaitTime(retry, initTime);
        logger.info(
          `Waiting ${waitTime / MILI} seconds before retrying...`,
        );
        await wait(waitTime);
        retry++;
      } else {
        throw error;
      }
    }
  }
}

export default asyncRetryWithBackoff;
