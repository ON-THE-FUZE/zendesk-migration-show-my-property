import 'dotenv/config';

const config = {
  zendeskEmail: process.env.ZENDESK_EMAIL,
  zendeskPass: process.env.ZENDESK_PASS,
  zendeskSubdomain: process.env.ZENDESK_SUBDOMAIN,
  zendeskToken: process.env.ZENDESK_TOKEN,
  hubspotToken: process.env.HUBSPOT_TOKEN,
};

export default config;
