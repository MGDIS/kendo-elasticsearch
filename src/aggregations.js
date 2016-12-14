import * as esUtils from './es-utils';
export const kendo2es = _kendo2es;
export const es2kendo = _es2kendo;

const kendoToESAgg = {
  count: 'cardinality',
  min: 'min',
  max: 'max',
  sum: 'sum',
  average: 'avg'
};

// Transform kendo aggregates into ES metric aggregations
function _kendo2es(aggregate, fields, nestedFields, esMappingKey, filter, groupNestedPath) {
  const esAggs = {};

  (aggregate || []).forEach(aggItem => {
    const field = fields[aggItem.field];
    let nestedPath = field.esNestedPath;
    let aggsWrapper = esAggs;
    if (groupNestedPath !== nestedPath) {
      const previousPathParts = [];
      if (groupNestedPath && nestedPath.indexOf(groupNestedPath) !== 0) {
        esAggs.group_reverse_nested = esAggs.group_reverse_nested || {
          reverse_nested: {},
          aggregations: {}
        };
        aggsWrapper = esAggs.group_reverse_nested.aggregations;
      } else if (groupNestedPath) {
        nestedPath = nestedPath.substr(groupNestedPath.length + 1, nestedPath.length);
      }

      nestedPath.split('.').forEach(nestedPathPart => {
        previousPathParts.push(nestedPathPart);
        const currentPath = groupNestedPath ?
          groupNestedPath + '.' + previousPathParts.join('.') :
          previousPathParts.join('.');
        const fullCurrentPath = esMappingKey ? esMappingKey + '.' + currentPath : currentPath;
        const currentFields = nestedFields[currentPath];
        if (!currentFields) return;
        if (!aggsWrapper[currentPath]) {
          aggsWrapper[currentPath + '_filter_nested'] = aggsWrapper[currentPath + '_filter_nested'] || {
            nested: {
              path: fullCurrentPath
            },
            aggregations: {}
          };
          aggsWrapper[currentPath + '_filter_nested'].aggregations[currentPath + '_filter'] =
            aggsWrapper[currentPath + '_filter_nested'].aggregations[currentPath + '_filter'] || {
              filter: esUtils.innerHitsFilter(fullCurrentPath, null, filter),
              aggregations: {}
            };
        }
        aggsWrapper = aggsWrapper[currentPath + '_filter_nested'].aggregations[currentPath + '_filter'].aggregations;
      });
    }

    aggsWrapper[aggItem.field + '_' + aggItem.aggregate] = {};
    aggsWrapper[aggItem.field + '_' + aggItem.aggregate][kendoToESAgg[aggItem.aggregate]] = {
      field: field.esAggName
    };
  });

  return esAggs;
}

// Transform aggregation results from a ES query to kendo aggregates
function _es2kendo(aggregations, previousAggregates) {
  const aggregates = previousAggregates || {};
  aggregations = aggregations || {};
  Object.keys(aggregations).forEach(aggKey => {
    if (!aggregations[aggKey]) return;
    ['count', 'min', 'max', 'average', 'sum'].forEach(aggType => {
      const suffixLength = aggType.length + 1;
      if (aggKey.substr(aggKey.length - suffixLength) === '_' + aggType) {
        const fieldKey = aggKey.substr(0, aggKey.length - suffixLength);
        aggregates[fieldKey] = aggregates[fieldKey] || {};
        aggregates[fieldKey][aggType] = aggregations[aggKey].value;
      }
    });

    if (aggKey.substr(aggKey.length - 7) === '_nested' || aggKey.substr(aggKey.length - 7) === '_filter') {
      // recursivity on intermediate levels
      _es2kendo(aggregations[aggKey], aggregates);
    }

  });
  return aggregates;
}
