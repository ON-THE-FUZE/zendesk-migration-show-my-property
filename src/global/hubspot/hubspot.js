import hubspot from '@hubspot/api-client';
import config from '../../lib/config.js';

const hubspotClient = new hubspot.Client({ accessToken: config.hubspotToken });

export default hubspotClient;
