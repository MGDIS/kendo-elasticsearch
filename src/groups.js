import * as aggregations from './aggregations';
import * as dataItems from './data-items';
export const kendo2es = _kendo2es;
export const es2kendo = _es2kendo;

// Transform kendo groups declaration into ES bucket aggregations
function _kendo2es(aggs, groups, fields, nestedFields, esMappingKey, filter) {
  let previousLevelAggs = [aggs];
  let previousLevelNestedPath = null;
  groups.forEach(group => {
    const field = fields[group.field];
    const nextLevelAggs = _kendoGroup2es(group, fields, nestedFields, esMappingKey, filter);

    const aggs = {};
    if (field.esNestedPath && field.esNestedPath.indexOf(previousLevelNestedPath) !== 0) {
      aggs[field.esNestedPath + '_nested'] = aggs[field.esNestedPath + '_nested'] || {
        nested: {
          path: field.esFullNestedPath
        },
        aggs: {}
      };
      aggs[field.esNestedPath + '_nested'].aggs[group.field + '_group'] = nextLevelAggs.group;
      aggs[field.esNestedPath + '_nested'].aggs[group.field + '_missing'] = nextLevelAggs.missing;
    } else {
      aggs[group.field + '_group'] = nextLevelAggs.group;
      aggs[group.field + '_missing'] = nextLevelAggs.missing;
    } // 3rd case for nested path that is not child of the previous group

    previousLevelAggs.forEach(previousLevelAgg => {
      Object.keys(aggs).forEach(aggKey => {
        previousLevelAgg[aggKey] = aggs[aggKey];
      });
    });
    previousLevelAggs = Object.keys(nextLevelAggs).map(aggKey => {
      return nextLevelAggs[aggKey].aggregations;
    });
    previousLevelNestedPath = field.esNestedPath;
  });
}

function _kendoGroup2es(group, fields, nestedFields, esMappingKey, filter) {
  const field = fields[group.field];
  const groupAgg = {};
  const missingAgg = {};

  // Look for a aggregate defined on group field
  // Used to customize the bucket aggregation for range, histograms, etc.
  let fieldAggregate;
  const groupAggregates = [];
  (group.aggregates || []).forEach(aggregate => {
    // We exclude strings that are not concerned by specific aggregations (only terms buckets)
    // And cause bugs when counting cardinality on own group.
    if (aggregate.field === group.field && field.type !== 'string') {
      fieldAggregate = aggregate;
    } else {
      groupAggregates.push(aggregate);
    }
  });

  if (fieldAggregate) {

    // We support date histogramms if a 'interval' key is passed
    // to the group definition
    groupAgg[fieldAggregate.aggregate] = {
      field: field.esAggName
    };
    if (fieldAggregate.interval) {
      groupAgg[fieldAggregate.aggregate].interval = fieldAggregate.interval;
    }
  } else {

    // Default is a term bucket aggregation
    // if used on a not analyzed field or subfield
    // it will create a group for each value of the field
    groupAgg.terms = {
      field: field.esAggName,
      size: 0
    };
  }

  missingAgg.missing = {
    field: field.esAggName
  };

  const esGroupAggregates = aggregations.kendo2es(
    groupAggregates,
    fields,
    nestedFields,
    esMappingKey,
    filter,
    field.esNestedPath
  );
  groupAgg.aggregations = esGroupAggregates;
  missingAgg.aggregations = esGroupAggregates;

  return {
    group: groupAgg,
    missing: missingAgg
  };
}

// Extraction aggregations from ES query result that will be used to group
// data items
function _parseGroupAggregations(aggregations, missingNested) {
  let groupAggregations = Object.keys(aggregations).filter(aggKey => {
    return aggKey.substr(aggKey.length - 6) === '_group';
  }).map(aggKey => {
    const fieldKey = aggKey.substr(0, aggKey.length - 6);
    if (missingNested) {
      aggregations[fieldKey + '_missing'].doc_count += missingNested;
    }
    return {
      group: aggregations[aggKey],
      missing: aggregations[fieldKey + '_missing'],
      fieldKey: fieldKey
    };
  });

  // extract other group aggregations from nested aggregations
  Object.keys(aggregations)
    .filter(aggKey => aggKey.substr(aggKey.length - 7) === '_nested')
    .forEach(aggKey => {
      // 'missing' count on a nested group aggregation =
      //      'document without nested objects' + 'nested objects with missing field'
      // and 'document without nested objects' is equal to 'number of documents' - 'number of nested documents'
      const missingNested = aggregations.doc_count - aggregations[aggKey].doc_count;
      groupAggregations =
        groupAggregations.concat(_parseGroupAggregations(aggregations[aggKey], missingNested));
    });

  return groupAggregations;
}

// Transform ES bucket aggregations into kendo groups of data items
// See doc here for format of groups:
// http://docs.telerik.com/KENDO-UI/api/javascript/data/datasource#configuration-schema.groups
function _es2kendo(items, aggregations, fields, aggregationsOnly) {
  let allGroups = [];
  if (aggregations) {
    const groupAggregations = _parseGroupAggregations(aggregations);

    // Find aggregations that are grouping aggregations (ie buckets in ES)
    groupAggregations.forEach(groupAggregation => {
      let groups = [];

      const groupDefs = _esAgg2kendo(
        groupAggregation.group,
        groupAggregation.missing,
        groupAggregation.fieldKey);

      if (!aggregationsOnly) {
        // Then distribute the data items in the groups
        groups = dataItems.fillInGroups(groupDefs, items, fields[groupAggregation.fieldKey]);
      } else {
        groups = groupDefs.keys.map(function (key) {
          return groupDefs.map[key];
        });
      }

      // Case when there is subgroups. Solve it recursively.
      let hasSubgroups = false;
      if (groupAggregation.group.buckets && groupAggregation.group.buckets[0]) {
        Object.keys(groupAggregation.group.buckets[0]).forEach(bucketKey => {
          if (bucketKey.substr(bucketKey.length - 6) === '_group' ||
            bucketKey.substr(bucketKey.length - 7) === '_nested') {
            hasSubgroups = true;
          }
        });
      }
      groups.forEach(group => {
        if (hasSubgroups) {
          group.hasSubgroups = true;
          group.items = _es2kendo(group.items, group.bucket, fields, aggregationsOnly);
        }
        delete group.bucket;
      });

      allGroups = allGroups.concat(groups);
    });
  }

  return allGroups;
}

// Transform a single bucket aggregation into kendo groups definitions
// Does not fill up the data items
function _esAgg2kendo(groupAggregation, missingAggregation, fieldKey) {
  const groupsMap = {};
  const groupKeys = [];

  // Each bucket in ES aggregation result is a group
  groupAggregation.buckets.forEach(bucket => {
    const bucketKey = bucket.key_as_string || bucket.key;
    groupKeys.push(bucketKey);
    groupsMap[bucketKey] = {
      field: fieldKey,
      value: bucketKey,
      hasSubgroups: false,
      aggregates: aggregations.es2kendo(bucket),
      items: [],
      bucket: bucket
    };
    groupsMap[bucketKey].aggregates[fieldKey] = {
      count: bucket.doc_count
    };
  });

  // Special case for the missing value
  groupsMap[''] = {
    field: fieldKey,
    value: '',
    hasSubgroups: false,
    aggregates: aggregations.es2kendo(missingAggregation),
    items: [],
    bucket: missingAggregation
  };
  groupsMap[''].aggregates[fieldKey] = {
    count: missingAggregation.doc_count
  };

  return {
    map: groupsMap,
    keys: groupKeys
  };
}
