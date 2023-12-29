const ZERO = 0;

const removeProperties = value => {
  const notAcceptedValues = [null, undefined, '', ' '];
  if (Array.isArray(value)) {
    return value.length === ZERO ? true : false;
  }

  return notAcceptedValues.some(data => data === value);
};

const mapObjectroperties = ({ object, hubspotProperty }) => {
  const properties = {};

  for (const key in object) {
    const valueKey = object[key];

    if (removeProperties(valueKey)) {
      continue;
    }

    const hubPropertyExist = hubspotProperty[key];

    if (!hubPropertyExist) {
      continue;
    }

    properties[hubPropertyExist] = valueKey;
  }

  return properties;
};

const manageTags = (tag) => {
  const patterns = [/^#\w+(#*\w+)*$/, /^\s*#\w+(\s*#\w+)*\s*$/];
  const checkPatterns = patterns.some(pattern => pattern.test(tag));

  if (checkPatterns) {
    return tag.match(/#\w+/g).map(word => word.trim().toLowerCase());
  }

  return tag.trim().toLowerCase();
};

const mapping = (model, data) => {
  let properties = {};

  const compositeProperties = ['address'];

  const phoneProperties = ['phone', 'mobile', 'fax'];

  const dateProperties = [
    'created_at',
    'last_login_at',
    'updated_at',
    'due_at',
  ];

  for (const [property, hubspotProperty] of Object.entries(model)) {
    let value = data[property];

    if (removeProperties(value)) {
      continue;
    }

    if (phoneProperties.some(phone => phone === property)) {
      const extMatch = value.match(/(\d+)\s*ext(?:\.|\b)\s*(\d+)/i);

      if (!value.match(/^(1|\+1)/)) {
        value = '+1' + value.replace(/(\D*ext.*)|\D/g, '');

        if (extMatch) {
          const extension = extMatch[2];
          value += `, ext. ${extension}`;
        }
      } else {
        value = value.replace(/(\D*ext.*)|\D/g, '');

        if (extMatch) {
          const mainNumber = value;
          const extension = extMatch[2];
          value = `+1${mainNumber}, ext. ${extension}`;
        }
      }
    }

    if (property === 'tags') {
      const tags = value.map(tag => manageTags(tag)).flat(Infinity);
      const uniqueValues = new Set(tags);
      value = [...uniqueValues].join(';');
    }

    if (dateProperties.some((dateProperty) => dateProperty === property)) {
      value = Date.parse(value);
    }

    if (
      compositeProperties.some(compositeProperty =>
        compositeProperty === property
      )
    ) {
      const result = mapObjectroperties({
        object: value,
        hubspotProperty,
      });

      properties = Object.assign(properties, result);
    } else {
      properties[hubspotProperty] = value;
    }
  }
  return properties;
};

export default mapping;
