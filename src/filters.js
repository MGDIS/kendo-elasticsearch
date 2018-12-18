export const kendo2es = _kendo2es;

// Transform a tree of kendo filters into a tree of ElasticSearch filters
function _kendo2es(kendoFilters, fields, initOptions) {
  let filters;

  // logicalConnective can be "and" or "or"
  let logicalConnective = 'and';

  if (kendoFilters.operator) {
    filters = [kendoFilters];
  } else if (kendoFilters.logic) {
    logicalConnective = kendoFilters.logic;
    filters = kendoFilters.filters || [];
  } else if (kendoFilters.constructor === Array) {
    filters = kendoFilters;
  } else {
    throw new Error('Unsupported filter object: ' + kendoFilters);
  }

  const esFilters = [];
  const esNestedFilters = {};

  filters.forEach(filter => {
    if (filter.logic) {
      esFilters.push(_kendo2es(filter, fields));
    } else {
      const field = fields[filter.field];
      if (!field) {
        throw new Error('Unknown field in filter: ' + filter.field);
      }
      let esFilter;
      try {
        esFilter = {
          query: {
            query_string: {
              query: _filterParam(filter, fields, initOptions),
              // support uppercase/lowercase and accents
              analyze_wildcard: true
            }
          }
        };
      } catch (error) {
        if (error.message === 'missing filter is not supported on nested fields') {
          esMissingNested = {
            nested: {
              path: field.esFullNestedPath,
              filter: {
                  not: {
                        exists: {
                          field: `${field.esFullNestedPath}.${field.esName}`
                        }
                    }
                }
            }
          }
        } else {
          throw error;
        }
      };

      if (field.esNestedPath && !esMissingNested) {
        const esNestedFilter = esNestedFilters[field.esNestedPath] || {
          nested: {
            path: field.esFullNestedPath,
            filter: {
              bool: {}
            }
          }
        };
        
        switch (logicalConnective) {
          case 'and': {
            esNestedFilter.nested.filter.bool.must = esNestedFilter.nested.filter.bool.must || [];
            esNestedFilter.nested.filter.bool.must.push(esFilter);
            break;
          }

          case 'or': {
            esNestedFilter.nested.filter.bool.should = esNestedFilter.nested.filter.bool.should || [];
            esNestedFilter.nested.filter.bool.should.push(esFilter);
            break;
          }
        }

        if (!esNestedFilters[field.esNestedPath]) {
          esFilter = esNestedFilters[field.esNestedPath] = esNestedFilter;
        } else {
          esFilter = null;
        }
      } else if (field.esParentType) {
        esFilter = {
          has_parent: {
            type: field.esParentType,
            filter: esFilter
          }
        };
      } else if (field.esChildType) {
        esFilter = {
          has_child: {
            type: field.esChildType,
            filter: esFilter
          }
        };
      }

      if (esFilter) {
        esFilters.push(esFilter);
      }

    }
  });

  const result = {
    bool: {}
  };
  switch (logicalConnective) {
    case 'and': {
      result.bool.must = esFilters;
      break;
    }

    case 'or': {
      result.bool.should = esFilters;
      break;
    }
  }

  if (esMissingNested) {
    result.bool.must_not = esMissingNested
  }

  return result;
}

// Transform a single kendo filter in a string
// that can be used to compose a ES query_string query
function _filterParam(kendoFilter, fields, initOptions) {

  // Boolean filter seems to forget the operator sometimes
  kendoFilter.operator = kendoFilter.operator || 'eq';

  // Use the filter field name except for contains
  // that should use classical search instead of regexp
  const field = fields[kendoFilter.field];

  // special case field that is a date deep down by displayed as a number
  if (field.duration) {
    if (!moment) {
      throw new Error('Working on durations requires to load momentjs library');
    }
  }

  if (field.duration === 'beforeToday') {
    kendoFilter.value = moment().startOf('day').subtract(kendoFilter.value, 'days').format();
    if (kendoFilter.operator === 'lt') kendoFilter.operator = 'gt';
    else if (kendoFilter.operator === 'lte') kendoFilter.operator = 'gte';
    else if (kendoFilter.operator === 'gt') kendoFilter.operator = 'lt';
    else if (kendoFilter.operator === 'gte') kendoFilter.operator = 'lte';
  }

  if (field.duration === 'afterToday') {
    kendoFilter.value = moment().startOf('day').add(kendoFilter.value, 'days').format();
  }

  let fieldName;
  if (kendoFilter.operator === 'search') {
    fieldName = field.esSearchName;
  } else {
    fieldName = field.esFilterName;
  }

  const fieldEscaped = _asESParameter(fieldName);
  const valueEscaped = _asESParameter(kendoFilter.value, kendoFilter.operator);

  const simpleBinaryOperators = {
    eq: '',
    search: '',
    lt: '<',
    lte: '<=',
    gt: '>',
    gte: '>='
  };

  if (simpleBinaryOperators[kendoFilter.operator] !== void 0) {
    const esOperator = simpleBinaryOperators[kendoFilter.operator];
    // Optional special condition, when comparing against bool false values
    // we treat also the missing property condition, like this, false === missing too
    // Event if this is not true, normally is the desired effect
    if (initOptions && initOptions.missingBooleanAsFalse === true && kendoFilter.value === false) {
      return (fieldEscaped + ':' + esOperator + valueEscaped) + ' OR _missing_:' + fieldEscaped;
    } else {
      return fieldEscaped + ':' + esOperator + valueEscaped;
    }
  } else {
    let expression;
    switch (kendoFilter.operator) {
      case 'neq':
        return 'NOT (' + fieldEscaped + ':' + valueEscaped + ')';
      case 'contains':
        return '(' + fieldEscaped + ':*' + valueEscaped + '*)';
      case 'doesnotcontain':
        return 'NOT (' + fieldEscaped + ':*' + valueEscaped + '*)';
      case 'startswith':
        return fieldEscaped + ':' + valueEscaped + '*';
      case 'endswith':
        return fieldEscaped + ':*' + valueEscaped;
      case 'missing':
        if (field.esNestedPath || field.esParentType || field.esChildType) {
          // missing in a nested document should be implemented as a "not nested exists"
          // but this is not really doable when mixing with other filters
          // see https://github.com/elastic/elasticsearch/issues/3495
          throw new Error('missing filter is not supported on nested fields');
        }
        expression = '_missing_:' + fieldEscaped;
        if (field.type === 'string') {
          expression += ' OR (' + fieldEscaped + ':"")';
        }
        return expression;
      case 'exists':
        expression = '_exists_:' + fieldEscaped;
        if (field.type === 'string') {
          expression += ' AND NOT(' + fieldEscaped + ':"")';
        }
        return expression;
      default:
        throw new Error('Unsupported Kendo filter operator: ' + kendoFilter.operator);
    }
  }
}

// Escape values so that they are suitable as an elasticsearch query_string query parameter
const escapeValueRegexp = /[+\-&|!()\{}\[\]^:"~*?:\/ ]/g;
const escapeSearchValueRegexp = /[+\-&|!()\{}\[\]^:~:\/]/g;

function _asESParameter(value, operator) {
  if (value.constructor === Date) {
    value = value.toISOString();
  } else if (typeof value === 'boolean' || typeof value === 'number') {
    value = '' + value;
  }

  // For the special 'search' operator we allow some wildcard and other characters
  if (operator === 'search') {
    value = value.replace('\\', '\\\\');
    if (((value.match(/"/g) || []).length % 2) === 1) {
      value = value.replace(/"/g, '\\"');
    }
    value = value.replace(escapeSearchValueRegexp, '\\$&');
    return value;
  }
  return value.replace('\\', '\\\\').replace(escapeValueRegexp, '\\$&');
}
