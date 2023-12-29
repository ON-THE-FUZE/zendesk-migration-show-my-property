import axios from 'axios';

const HttpClient = function({ baseURL, headers }) {
  this.instance = axios.create({
    baseURL,
    headers,
  });

  this.get = async function(url, config) {
    return await this.instance.get(url, config);
  };

  this.put = async function(url, data, config) {
    return await this.instance.put(url, data, config);
  };

  this.post = async function(url, data, config) {
    return await this.instance.post(url, data, config);
  };

  this.patch = async function(url, data, config) {
    return await this.instance.patch(url, data, config);
  };

  this.delete = async function(url, config) {
    return await this.instance.delete(url, config);
  };
};

export default HttpClient;
