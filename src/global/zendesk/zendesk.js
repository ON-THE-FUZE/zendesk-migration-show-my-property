import { Buffer } from 'node:buffer';
import HttpClient from '../http/httpClient';

const getBasicAuth = ({ email, password }) => {
  const data = `${email}/token:${password}`;
  return Buffer.from(data).toString('base64');
};

const createHttpClient = ({ headers, url }) => {
  return new HttpClient({ baseURL: url, headers });
};

const existInstance = (instance) => {
  if (!instance) {
    throw `The ${instance} instance is null, please review the object creation`;
  }
};

const ZendeskClient = function({ accessToken, email, password, subdomain }) {
  this.support = null;
  this.sell = null;

  if (accessToken) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };

    this.sell = createHttpClient({ headers, url: 'https://api.getbase.com' });
  }

  if (user && password && subdomain) {
    const basicAuth = getBasicAuth({ email, password });

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Basic ${basicAuth}`,
    };

    this.support = createHttpClient({ headers, url: subdomain });
  }
};

ZendeskClient.prototype.support = {
  users: {
    get: {
      async users(params = {}) {
        existInstance(this.support);
        const url = `/api/v2/users`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
      async search(params = {}) {
        existInstance(this.support);
        const url = `/api/v2/users/search`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
      async groups(id, params = {}) {
        existInstance(this.support);
        const url = `/api/v2/groups/${id}/users`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
      async organizations(id, params = {}) {
        existInstance(this.support);
        const url = `/api/v2/organizations/${id}/users`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
      async count(params = {}) {
        existInstance(this.support);
        const url = `/api/v2/users/count`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
    },
  },
  organizations: {
    get: {
      async users(id, params = {}) {
        existInstance(this.support);
        const url = `/api/v2/users/${id}/organizations`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
      async organizations(params = {}) {
        existInstance(this.support);
        const url = `/api/v2/organizations`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
    },
  },
  tickets: {
    get: {
      async cursor(params = {}) {
        existInstance(this.support);
        const url = `/api/v2/incremental/tickets/cursor`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
      async tickets(params = {}) {
        existInstance(this.support);
        const url = `/api/v2/tickets/`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
      async conversations(id, params = {}) {
        existInstance(this.support);
        const url = `/api/v2/tickets/${id}/comments`;
        const response = await this.support.get(url, { params });
        return response.data;
      },
    },
  },
};

ZendeskClient.prototype.sell = {
  contacts: {
    async all(params = {}) {
      existInstance(this.sell);
      const url = `/v2/contacts`;
      const response = await this.sell.get(url, { params });
      return response.data;
    },
  },
  leads: {
    async all(params = {}) {
      existInstance(this.sell);
      const url = `/v2/leads`;
      const response = await this.sell.get(url, { params });
      return response.data;
    },
  },
  deals: {
    async all(params = {}) {
      existInstance(this.sell);
      const url = `/v2/deals`;
      const response = await this.sell.get(url, { params });
      return response.data;
    },
  },
  notes: {
    async all(params = {}) {
      existInstance(this.sell);
      const url = `/v2/notes`;
      const response = await this.sell.get(url, { params });
      return response.data;
    },
  },
  calls: {
    async all(params = {}) {
      existInstance(this.sell);
      const url = `/v2/calls`;
      const response = await this.sell.get(url, { params });
      return response.data;
    },
  },
  tasks: {
    async all(params = {}) {
      existInstance(this.sell);
      const url = `/v2/tasks`;
      const response = await this.sell.get(url, { params });
      return response.data;
    },
  },
};

export default ZendeskClient;
