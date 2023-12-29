import config from '../../lib/config.js';
import ZendeskClient from './zendesk.js';

const email = config.zendeskEmail;
const password = config.zendeskPass;
const subdomain = config.zendeskSubdomain;
const accessToken = config.zendeskToken;

const zendesk = new ZendeskClient({ accessToken, email, password, subdomain });

export default zendesk;
