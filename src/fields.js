export const fromMapping = _fromMapping;
export const fill = _fill;

// Transform a mapping definition from ElasticSearch into a kendo fields map
// This utility function is exposed as it can be interesting to use it before instantiating
// the actual datasource
// @param mapping - An elasticsearch mapping
function _fromMapping(
  mapping, model, fields, prefix, esPrefix, nestedPath) {
  fields = fields || {};
  prefix = prefix || '';
  Object.keys(mapping.properties || {}).forEach(propertyKey => {
    const property = mapping.properties[propertyKey];
    const curedPropertyKey = asKendoPropertyKey(propertyKey);
    const prefixedName = prefix ? prefix + '_' + curedPropertyKey : curedPropertyKey;
    const esName = esPrefix ? esPrefix + '.' + propertyKey : propertyKey;

    if (property.type === 'nested') {
      // Case where the property is a nested object
      const subNestedPath = nestedPath ? nestedPath + '.' + esName : esName;
      _fromMapping(property, model, fields, prefixedName, '', subNestedPath);
    } else if (property.properties) {
      // Case where the property is a non nested object with properties
      _fromMapping(property, model, fields, prefixedName, esName, nestedPath);
    } else if (property.type === 'object') {
      // Case where the property is a non nested object with zero subproperties. do nothing.
    } else {
      // Finally case of a leaf property
      const field = fields[prefixedName] = fields[prefixedName] || {};

      // if the field was already defined with a nested path,
      // then we are in the case of field both nested and included in parent
      // then we should not consider it as a real leaf property
      if (!field.esNestedPath) {
        field.type = field.type || property.type;

        // ES supports a variety of numeric types. In JSON and kendo it is simply 'number'.
        if (['float', 'double', 'integer', 'long', 'short', 'byte'].indexOf(field.type) !== -1) {
          field.type = 'number';
        }

        // Default is splitting data lines except for string fields
        if (field.type !== 'string') {
          field.esMultiSplit = true;
        }

        if (nestedPath) {
          field.esNestedPath = nestedPath;
        }
        field.esName = esName;

        // When the field is not analyzed, the default string subfields should not be applied.
        if (property.index === 'not_analyzed') {
          field.esSearchSubField = null;
          field.esFilterSubField = null;
          field.esAggSubField = null;
        }
      }
    }
  });

  _fill(fields, model);

  return fields;
};

// Associate Kendo field names to ElasticSearch field names.
// We have to allow ElasticSearch field names to be different
// because ES likes an "@" and/or dots in field names while Kendo fails on that.
// Filtering and aggregating can be based on a a different field if esFilterName
// or esAggName are defined or on a subfield if esFilterSubField or esAggSubField are defined.
// Typical use case is the main field is analyzed, but it has a subfield that is not
// (or only with a minimal analyzer)
function _fill(fields, model) {
  for (const k in fields) {
    if (fields.hasOwnProperty(k)) {
      const field = fields[k];
      field.key = k;
      field.esName = field.esName || k;
      field.esNameSplit = field.esName.split('.');
      field.esFullNestedPath = field.esNestedPath;
      if (model.esMappingKey) {
        field.esFullNestedPath = model.esMappingKey + '.' + field.esFullNestedPath;
      }
      if (!field.esSearchName) {
        field.esSearchName = field.esName;
        if (field.hasOwnProperty('esSearchSubField')) {
          if (field.esSearchSubField) {
            field.esSearchName += '.' + field.esSearchSubField;
          }
        } else if (field.type === 'string' &&
          model.esStringSubFields &&
          model.esStringSubFields.search) {
          field.esSearchName += '.' + model.esStringSubFields.search;
        }
        if (field.esNestedPath) {
          field.esSearchName = field.esNestedPath + '.' + field.esSearchName;
        }
      }
      if (!field.esFilterName) {
        field.esFilterName = field.esName;
        if (field.hasOwnProperty('esFilterSubField')) {
          if (field.esFilterSubField) {
            field.esFilterName += '.' + field.esFilterSubField;
          }
        } else if (field.type === 'string' &&
          model.esStringSubFields &&
          model.esStringSubFields.filter) {
          field.esFilterName += '.' + model.esStringSubFields.filter;
        }
        if (field.esNestedPath) {
          field.esFilterName = field.esNestedPath + '.' + field.esFilterName;
        }
      }
      if (!field.esAggName) {
        field.esAggName = field.esName;
        if (field.hasOwnProperty('esAggSubField')) {
          if (field.esAggSubField) {
            field.esAggName += '.' + field.esAggSubField;
          }
        } else if (field.type === 'string' &&
          model.esStringSubFields &&
          model.esStringSubFields.agg) {
          field.esAggName += '.' + model.esStringSubFields.agg;
        }
        if (field.esNestedPath) {
          field.esAggName = field.esFullNestedPath + '.' + field.esAggName;
        }
      }
    }
  }
}

// Get a property key and transform it in a suitable key for kendo
// the constraint is that kendo needs a key suitable for javascript object's dot notation
// i.e a valid js identifier with alphanumeric chars + '_' and '$'
function asKendoPropertyKey(value) {
  return value.replace(/[^a-zA-z0-9_$]/g, '_');
}
