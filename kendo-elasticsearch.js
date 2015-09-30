/**
 * A Kendo DataSource that gets its data from ElasticSearch.
 *
 * Read-only, supports paging, filtering, sorting, grouping and aggregations.
 */
(function($, kendo) {
  "use strict";

  var data = kendo.data;

  data.ElasticSearchDataSource = data.DataSource.extend({
    init: function(initOptions) {

      // Prepare the transport to query ES
      // The only required parameter is transport.read.url
      if (initOptions.transport && initOptions.transport.read && initOptions.transport.read.url) {
        var readTrasnsport = initOptions.transport.read;
        readTrasnsport.dataType = readTrasnsport.dataType || "json";
        readTrasnsport.method = readTrasnsport.method || "POST";
        readTrasnsport.contentType = readTrasnsport.contentType || "application/json";
      } else {
        throw new Error("transport.read.url must be set to use ElasticSearchDataSource");
      }

      // Associate Kendo field names to ElasticSearch field names.
      // We have to allow ElasticSearch field names to be different
      // because ES likes an "@" and/or dots in field names while Kendo fails on that.
      // Filtering and aggregating can be based on a a different field if esFilterName
      // or esAggName are defined or on a subfield if esFilterSubField or esAggSubField are defined.
      // Typical use case is the main field is analyzed, but it has a subfield that is not
      // (or only with a minimal analyzer)
      var _fields = this._fields = initOptions.schema.model.fields;
      for (var k in _fields) {
        if (_fields.hasOwnProperty(k)) {
          var field = _fields[k];
          field.esName = field.esName || k;
          if (!field.esFilterName) {
            field.esFilterName = field.esName;
            if (field.esFilterSubField) {
              field.esFilterName += "." + field.esFilterSubField;
            }
          }
          if (!field.esAggName) {
            field.esAggName = field.esName;
            if (field.esAggSubField) {
              field.esAggName += "." + field.esAggSubField;
            }
          }
        }
      }

      // Prepare the content of the query that will be sent to ES
      // based on the kendo data structure
      initOptions.transport.parameterMap = function(data) {
        var sortParams = arrayify(data.sort || data.group);

        var esParams = {};
        if (data.skip) {
          esParams.from = data.skip;
        }
        if (data.take) {
          esParams.size = data.take;
        }

        // Transform kendo sort params in a ES sort list
        esParams.sort = sortParams.map(function(sortItem) {
          var esSortItem = {};
          esSortItem[_fields[sortItem.field].esFilterName] = {
            order: sortItem.dir
          };
          return esSortItem;
        });

        // Transform kendo filters into a ES query using a query_string request
        if (data.filter) {
          esParams.query = kendoFiltersToES(data.filter, _fields);
        }

        // Fetch only the required list of fields from ES
        esParams.fields = Object.keys(_fields).map(function(k) {
          return _fields[k].esName;
        });
        esParams._source = false;

        // Transform kendo aggregations into ES aggregations
        esParams.aggs = kendoAggregationToES(data.aggregate, _fields);

        // Transform Kendo group instruction into an ES bucket aggregation
        kendoGroupToES(esParams.aggs, data.group, _fields);

        return JSON.stringify(esParams);
      };

      var schema = initOptions.schema;

      // Parse the results from elasticsearch to return data items,
      // total and aggregates for Kendo grid
      schema.parse = function(response) {
        var dataItems = esHitsToDataItems(response.hits.hits, _fields);
        var aggregates = esAggToKendoAgg(response.aggregations);
        var groups = esAggToKendoGroups(dataItems, response.aggregations);

        return {
          total: response.hits.total,
          data: dataItems,
          aggregates: aggregates,
          groups: groups
        };
      };

      schema.aggregates = function(response) {
        return response.aggregates;
      };

      schema.groups = function(response) {
        return response.groups;
      };

      schema.data = schema.data || "data";
      schema.total = schema.total || "total";
      schema.model.id = schema.model.id || "_id";

      initOptions.serverFiltering = true;
      initOptions.serverSorting = true;
      initOptions.serverPaging = true;
      initOptions.serverAggregates = true;
      initOptions.serverGrouping = true;

      data.DataSource.fn.init.call(this, initOptions);
    }
  });

  // Transform a list of Kendo filters into a ES filtered query
  function kendoFiltersToES(kendoFilters, fields) {

    // there are three possible structures for the kendoFilterObj:
    //  * {value: "...", operator: "...", field: " ..."}
    //  * {logic: "...", filters: ...}
    //  * [ ... ]
    var filters;

    // logicalConnective can be "and" or "or"
    var logicalConnective = "and";

    if (kendoFilters.operator) {
      filters = [kendoFilters];
    } else if (kendoFilters.logic) {
      logicalConnective = kendoFilters.logic;
      filters = kendoFilters.filters;
    } else if (kendoFilters.constructor == Array) {
      filters = kendoFilters.filters;
    } else {
      throw new Error("Unsupported filter object: " + kendoFilters);
    }

    var esParams = [];
    for (var i = 0; i < filters.length; i++) {
      esParams.push(" (" + kendoFilterToES(filters[i], fields) + ") ");
    }

    // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
    return {
      filtered: {
        filter: {
          query: {
            query_string: {
              query: esParams.join(logicalConnective.toUpperCase()),
              lowercase_expanded_terms: true,
              default_operator: "AND"
            }
          }
        }
      }
    };
  }

  // Transform a single kendo filter in a string
  // that can be used to compose a ES query_string query
  function kendoFilterToES(kendoFilter, fields) {

    // Use the filter field name except for contains
    // that should use classical search instead of regexp
    var field;
    if (kendoFilter.operator === "contains" || kendoFilter.operator === "doesnotcontain") {
      field = fields[kendoFilter.field].esName;
    } else {
      field = fields[kendoFilter.field].esFilterName;
    }

    var fieldEscaped = asESParameter(field);
    var valueEscaped = asESParameter(kendoFilter.value);

    var simpleBinaryOperators = {
      eq: "",
      contains: "",
      lt: "<",
      lte: "<=",
      gt: ">",
      gte: ">="
    };

    if (simpleBinaryOperators[kendoFilter.operator] !== void 0) {
      var esOperator = simpleBinaryOperators[kendoFilter.operator];
      return fieldEscaped + ":" + esOperator + valueEscaped;
    } else {
      switch (kendoFilter.operator) {
        case "neq":
          return "NOT (" + fieldEscaped + ":" + valueEscaped + ")";
        case "doesnotcontain":
          return "NOT (" + fieldEscaped + ":" + valueEscaped + ")";
        case "startswith":
          return fieldEscaped + ":" + valueEscaped + "*";
        case "endswith":
          return fieldEscaped + ":*" + valueEscaped;
        default:
          throw new Error("Unsupported Kendo filter operator: " + kendoFilter.operator);
      }
    }
  }

  // Transform aggregation results from a ES query to kendo aggregates
  function esAggToKendoAgg(aggregations) {
    var aggregates = {};
    Object.keys(aggregations || {}).forEach(function(aggKey) {
      ["count", "min", "max", "average", "sum"].forEach(function(aggType) {
        var suffixLength = aggType.length + 1;
        if (aggKey.substr(aggKey.length - suffixLength) === "_" + aggType) {
          var fieldKey = aggKey.substr(0, aggKey.length - suffixLength);
          aggregates[fieldKey] = aggregates[fieldKey] || {};
          aggregates[fieldKey][aggType] = aggregations[aggKey].value;
        }
      });
    });
    return aggregates;
  }

  // Transform ES bucket aggregations into kendo groups of data items
  function esAggToKendoGroups(dataItems, aggregations) {
    var groups = [];
    if (aggregations) {
      Object.keys(aggregations).forEach(function(aggKey) {
        var suffixLength = "group".length + 1;
        if (aggKey.substr(aggKey.length - suffixLength) === "_group") {
          var fieldKey = aggKey.substr(0, aggKey.length - suffixLength);
          var groupsMap = {};
          var groupKeys = [];

          // Each bucket in ES aggregation result is a group
          aggregations[aggKey].buckets.forEach(function(bucket) {
            var bucketKey = bucket.key_as_string || bucket.key;
            groupKeys.push(bucketKey);
            groupsMap[bucketKey] = {
              field: fieldKey,
              value: bucketKey,
              hasSubGroups: false,
              aggregates: esAggToKendoAgg(bucket),
              items: []
            };
            groupsMap[bucketKey].aggregates[fieldKey] = {
              count: bucket.doc_count
            };
          });

          // Special case for the missing value
          groupsMap[""] = {
            field: fieldKey,
            value: "",
            hasSubGroups: false,
            aggregates: esAggToKendoAgg(aggregations[fieldKey + "_missing"]),
            items: []
          };
          groupsMap[""].aggregates[fieldKey] = {
            count: aggregations[fieldKey + "_missing"].doc_count
          };

          dataItems.forEach(function(dataItem) {
            var group = groupsMap[dataItem[fieldKey]];

            // If no exact match, then we may be in some range aggregation ?
            if (!group) {
              for (var i = 0; i < groupKeys.length; i++) {
                if (dataItem[fieldKey] >= groupKeys[i]) {
                  if (!groupKeys[i + 1] || dataItem[fieldKey] < groupKeys[i + 1]) {
                    group = groupsMap[groupKeys[i]];
                  }
                }
              }
            }

            if (!group) {
              throw new Error("No group found, val: " + dataItem[fieldKey] + " field: " + fieldKey);
            }
            group.items.push(dataItem);
            if (group.items.length === 1) {
              groups.push(group);
            }
          });
        }
      });
    }

    return groups;
  }

  function esHitsToDataItems(hits, fields) {
    var dataItems = [];
    for (var i = 0; i < hits.length; i++) {
      var hitFields = hits[i].fields || {};
      var dataItem = {};

      dataItem.id = [hits[i]._id];
      for (var k in fields) {
        var values = hitFields[fields[k].esName] || [];
        if (fields[k].esMultiSplit) {
          dataItem[k] = values;
        } else {
          dataItem[k] = [values.join(fields[k].esMultiSeparator || ";")];
        }
      }

      dataItems.push(dataItem);
    }
    return splitMultiValues(dataItems);
  }

  // Transform kendo aggregates into ES metric aggregations
  var kendoToESAgg = {
    count: "cardinality",
    min: "min",
    max: "max",
    sum: "sum",
    average: "avg"
  };

  function kendoAggregationToES(aggregate, fields) {
    var esAggs = {};

    if (aggregate && aggregate.length > 0) {
      esAggs = {};

      aggregate.forEach(function(aggItem) {
        var field = fields[aggItem.field].esAggName;

        esAggs[aggItem.field + "_" + aggItem.aggregate] = {};
        esAggs[aggItem.field + "_" + aggItem.aggregate][kendoToESAgg[aggItem.aggregate]] = {
          field: field
        };
      });
    }

    return esAggs;
  }

  // Transform kendo groups declaration into ES bucket aggregations
  // Only 1 level of grouping is supported for now
  function kendoGroupToES(aggs, groups, fields) {
    if (!groups || groups.length === 0) {
      return;
    }
    var group = groups[0];
    var field = fields[group.field];
    var groupAgg = aggs[group.field + "_group"] = {};

    // Look for a aggregate defined on group field
    // Used to customize the bucket aggregation
    var fieldAggregate;
    var groupAggregates = [];
    (group.aggregates || []).forEach(function(aggregate) {
      if (aggregate.field === group.field) {
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

    var missingAgg = aggs[group.field + "_missing"] = {
      missing: {
        field: field.esAggName
      }
    };

    if (groups[0].aggregates) {
      groupAgg.aggregations = kendoAggregationToES(groupAggregates, fields);
      missingAgg.aggregations = kendoAggregationToES(groupAggregates, fields);
    }

  }

  function splitMultiValues(items) {
    var results = [];

    // Iterates on items in the array and multiply based on multiple values
    items.forEach(function(item) {
      var itemResults = [{}];

      // Iterate on properties of item
      Object.keys(item).forEach(function(k) {

        var partialItemResults = [];

        // Iterate on the multiple values of this property
        item[k].forEach(function(val) {
          itemResults.forEach(function(result) {

            // Clone the result to create variants with the different values of current key
            var newResult = {};
            Object.keys(result).forEach(function(k2) {
              newResult[k2] = result[k2];
            });
            newResult[k] = val;
            partialItemResults.push(newResult);
          });
        });
        itemResults = partialItemResults;
      });

      results = results.concat(itemResults);
    });
    return results;
  }

  // Escape values so that they are suitable as an elasticsearch query_string query parameter
  function asESParameter(value) {
    if (value.constructor == Date) {
      value = value.toISOString();
    }
    return value.replace("\\", "\\\\").replace(/[+\-&|!()\{}\[\]^:"~*?:\/ ]/g, "\\$&");
  }

  // Helper functions for conversion of query parameters from Kendo to ElasticSearch format
  function arrayify(myArg) {
    var _argArray = [];

    if (myArg && myArg.constructor == Array) {
      _argArray = myArg;
    } else {
      if (myArg) {
        _argArray.push(myArg);
      }
    }

    return _argArray;
  }

})(window.jQuery, window.kendo);
