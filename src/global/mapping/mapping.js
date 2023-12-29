const mapping = (model, data) => {
  try {
    const ZERO = 0;
    const properties = {};
    for (const [property, hubspotProperty] of Object.entries(model)) {
      const dateProperties = [
        'created_at',
        'last_login_at',
        'updated_at',
        'due_at',
      ];

      let value = data[property];
      if (value === null || value === undefined || value.length === ZERO) {
        continue;
      }

      if (property === 'locale') {
        value = value.toLowerCase();
      }

      if (property === 'tags') {
        value = `${value}`;
      }

      if (dateProperties.some((dateProperty) => dateProperty === property)) {
        value = Date.parse(value);
      }

      properties[hubspotProperty] = value;
    }
    return properties;
  } catch (error) {
    throw `Error on the mapping process - ${error}`;
  }
};

export default mapping;
