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
            } else if (field.type === "string" &&
              initOptions.schema.model.esStringSubFields &&
              initOptions.schema.model.esStringSubFields.filter) {
              field.esFilterName += "." + initOptions.schema.model.esStringSubFields.filter;
            }
            if (field.esNestedPath) {
              field.esFilterName = field.esNestedPath + "." + field.esFilterName;
            }
          }
          if (!field.esAggName) {
            field.esAggName = field.esName;
            if (field.esAggSubField) {
              field.esAggName += "." + field.esAggSubField;
            } else if (field.type === "string" &&
              initOptions.schema.model.esStringSubFields &&
              initOptions.schema.model.esStringSubFields.agg) {
              field.esAggName += "." + initOptions.schema.model.esStringSubFields.agg;
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
        esParams.sort = kendoSortToES(sortParams, _fields);

        // Transform kendo filters into a ES query using a query_string request
        // Also add optionally a top level inner_hits definition
        kendoFiltersToES(esParams, data.filter || [], _fields, sortParams);

        // Fetch only the required list of fields from ES
        esParams.fields = Object.keys(_fields)
          .filter(function(k) {
            return !_fields[k].esNestedPath && !_fields[k].esParentType && !_fields[k].esChildType;
          })
          .map(function(k) {
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

  // Transform sort instruction into some object suitable for Elasticsearch
  // Also deal with sorting the different nesting levels
  function kendoSortToES(sort, fields, nestedPath) {
    return sort.filter(function(sortItem) {
      var field = fields[sortItem.field];
      return field.esNestedPath === nestedPath ||
        field.esParentType === nestedPath ||
        field.esChildType === nestedPath;
    }).map(function(sortItem) {
      var field = fields[sortItem.field];
      var esSortItem = {};
      esSortItem[field.esFilterName] = {
        order: sortItem.dir
      };
      return esSortItem;
    });
  }

  // Transform a list of Kendo filters into a ES filtered query
  function kendoFiltersToES(esQuery, kendoFilters, fields, sort) {

    // there are three possible structures for the kendoFilterObj:
    //  * {value: "...", operator: "...", field: " ..."}
    //  * {logic: "...", filters: ...}.

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
      filters = kendoFilters;
    } else {
      throw new Error("Unsupported filter object: " + kendoFilters);
    }

    var esParams = [];
    var nestedESParams = {};
    var parentESParams = {};
    var childESParams = {};
    var nestedFields = {};
    var parentFields = {};
    var childFields = {};
    Object.keys(fields).forEach(function(fieldKey) {
      var field = fields[fieldKey];
      if (field.esNestedPath) {
        nestedESParams[field.esNestedPath] = nestedESParams[field.esNestedPath] || [];
        nestedFields[field.esNestedPath] = nestedFields[field.esNestedPath] || [];
        nestedFields[field.esNestedPath].push(field.esName);
      }
      if (field.esParentType) {
        parentESParams[field.esParentType] = parentESParams[field.esParentType] || [];
        parentFields[field.esParentType] = parentFields[field.esParentType] || [];
        parentFields[field.esParentType].push(field.esName);
      }
      if (field.esChildType) {
        childESParams[field.esChildType] = childESParams[field.esChildType] || [];
        childFields[field.esChildType] = childFields[field.esChildType] || [];
        childFields[field.esChildType].push(field.esName);
      }
    });
    filters.forEach(function(filter) {
      if (fields[filter.field].esNestedPath) {
        var nestedPath = fields[filter.field].esNestedPath;
        nestedESParams[nestedPath]
          .push(" (" + kendoFilterToESParam(filter, fields) + ") ");
      } else if (fields[filter.field].esParentType) {
        var parentType = fields[filter.field].esParentType;
        parentESParams[parentType]
          .push(" (" + kendoFilterToESParam(filter, fields) + ") ");
      } else if (fields[filter.field].esChildType) {
        var childType = fields[filter.field].esChildType;
        childESParams[childType]
          .push(" (" + kendoFilterToESParam(filter, fields) + ") ");
      } else {
        esParams.push(" (" + kendoFilterToESParam(filter, fields) + ") ");
      }
    });

    // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
    esQuery.query = {
      filtered: {
        filter: {}
      }
    };
    esQuery.inner_hits = {};

    // Create either a 'and' or 'or' filter
    var queryFilters = esQuery.query.filtered.filter[logicalConnective] = [];

    // Create a query_string filter for all filters on root document
    queryFilters.push(combineESParams(esParams, logicalConnective));

    // Create a nested query_string filter for each nested document filter
    Object.keys(nestedESParams).forEach(function(nestedPath) {
      var filter = combineESParams(nestedESParams[nestedPath], logicalConnective);
      var nestedQueryFilters = findNestedFilter(queryFilters, nestedPath, logicalConnective);
      var nestedFilter = {
        nested: {
          path: nestedPath,
          filter: {}
        }
      };
      nestedFilter.nested.filter[logicalConnective] = [];
      nestedFilter.nested.filter[logicalConnective].push(filter);
      nestedQueryFilters.push(nestedFilter);
      addInnerHits(esQuery.inner_hits,
        nestedPath,
        nestedPath,
        nestedFields[nestedPath],
        kendoSortToES(sort, fields, nestedPath),
        nestedFilter.nested.filter);
    });

    // Create a has_parent query_string filter for each parent filter
    // TODO: use top level inner_hits (through addInnerHits()) here too ?
    // we could allow looking for nesting objects in parents or looking for grandparents, etc
    Object.keys(parentESParams).forEach(function(parentType) {
      queryFilters.push({
        has_parent: {
          type: parentType,
          filter: combineESParams(parentESParams[parentType], logicalConnective),
          inner_hits: {
            fields: parentFields[parentType],
            size: 10000,
            sort: kendoSortToES(sort, fields, parentType)
          }
        }
      });
    });

    // Create a has_child query_string filter for each child filter
    // TODO: use top level inner_hits (through addInnerHits()) here too ?
    // we could allow looking for nesting objects in children or looking for grandchildren, etc
    Object.keys(childESParams).forEach(function(childType) {
      queryFilters.push({
        has_child: {
          type: childType,
          filter: combineESParams(childESParams[childType], logicalConnective),
          inner_hits: {
            fields: childFields[childType],
            size: 10000,
            sort: kendoSortToES(sort, fields, childType)
          }
        }
      });
    });
  }

  // Add a inner_hits definition into the top level inner_hits object
  // of the elasticsearch query
  function addInnerHits(innerHits, path, partialPath, fields, sort, filter) {
    var nestedInnerHits = false;
    Object.keys(innerHits).forEach(function(existingPath) {

      // If a inner_hit definition exists for a part of the path
      // then we should nest this one inside recursively
      if (path.indexOf(existingPath) === 0) {
        var existingInnerHit = innerHits[existingPath].path[existingPath];
        nestedInnerHits = true;
        existingInnerHit.inner_hits = existingInnerHit.inner_hits || {};
        addInnerHits(
          existingInnerHit.inner_hits,
          path,
          path.substr(existingPath.length + 1, path.length),
          fields,
          sort,
          filter);
      }
    });

    if (!nestedInnerHits) {
      innerHits[path] = {
        path: {}
      };
      innerHits[path].path[path] = {
        fields: fields,
        size: 10000,
        sort: sort,
        query: {
          filtered: {
            filter: filter
          }
        }
      };
    }
  }

  // Find or create the nested filter definition for a specified nested path
  function findNestedFilter(queryFilters, nestedPath, logicalConnective) {
    var nestedFilter = queryFilters;
    queryFilters.forEach(function(existingFilter) {
      if (existingFilter && existingFilter.nested && existingFilter.nested.path) {

        // A filter was walredy defined for this path, just return it we will append to it
        if (existingFilter.nested.path === nestedPath) {
          nestedFilter = existingFilter.nested.filter[logicalConnective];
        }

        // A filter was already defined for a part of the path
        // Then build a multi level nested filter using recursivity
        if (nestedPath.indexOf(existingFilter.nested.path) === 0) {
          nestedFilter = findNestedFilter(
            existingFilter.nested.filter[logicalConnective],
            nestedPath.substr(existingFilter.nested.path.length + 1, nestedPath.length),
            logicalConnective
          );
        }
      }
    });
    return nestedFilter;
  }

  // Transform a single kendo filter in a string
  // that can be used to compose a ES query_string query
  function kendoFilterToESParam(kendoFilter, fields) {

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

  // Combine a list of individual filter parameters into a query_string filter
  function combineESParams(params, logicalConnective) {
    var filter;
    if (params.length > 0) {
      filter = {
        query: {
          query_string: {
            query: params.join(logicalConnective.toUpperCase()),
            lowercase_expanded_terms: true,
            default_operator: "AND"
          }
        }
      };
    } else {
      filter = {
        "match_all": {}
      };
    }
    return filter;
  }

  var kendoToESAgg = {
    count: "cardinality",
    min: "min",
    max: "max",
    sum: "sum",
    average: "avg"
  };

  // Transform kendo aggregates into ES metric aggregations
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
            var group = groupsMap[dataItem[fieldKey] || ""];

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
    hits.forEach(function(hit) {
      var hitFields = hit.fields || {};
      var dataItem = {};

      dataItem.id = [hit._id];
      for (var k in fields) {
        var values = hitFields[fields[k].esName];
        if (values) {
          if (fields[k].esMultiSplit) {
            dataItem[k] = values;
          } else {
            dataItem[k] = values.join(fields[k].esMultiSeparator || ";");
          }
        }
      }

      var nestedItems = [];
      Object.keys(hit.inner_hits || {}).forEach(function(innerHitKey) {
        nestedItems = nestedItems
          .concat(esHitsToDataItems(hit.inner_hits[innerHitKey].hits.hits, fields));
      });

      if (nestedItems.length > 0) {
        nestedItems.forEach(function(nestedItem) {
          Object.keys(dataItem).forEach(function(key) {
            nestedItem[key] = dataItem[key];
          });
        });
        dataItems = dataItems.concat(nestedItems);
      } else {
        dataItems.push(dataItem);
      }

    });
    return splitMultiValues(dataItems);
  }

  // Split lines of data items based on their optionally multipl items
  // Example: [{a:[1,2],b:[3]}] -> [{a:1,b:3},{a:2,b:3}]
  function splitMultiValues(items) {
    var results = [];

    // Iterates on items in the array and multiply based on multiple values
    items.forEach(function(item) {
      var itemResults = [{}];

      // Iterate on properties of item
      Object.keys(item).forEach(function(k) {

        var partialItemResults = [];

        // Iterate on the multiple values of this property
        if (item[k] && item[k].constructor == Array) {
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
        } else {
          itemResults.forEach(function(result) {
            result[k] = item[k];
            partialItemResults.push(result);
          });
        }
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
    } else if (typeof value === "boolean") {
      value = "" + value;
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
