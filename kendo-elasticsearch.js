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
      if (!initOptions) {
        throw new Error("Options are required to use ElasticSearchDataSource");
      }

      // Prepare the transport to query ES
      // The only required parameter is transport.read.url
      if (initOptions.transport && initOptions.transport.read && initOptions.transport.read.url) {
        var readTransport = initOptions.transport.read;
        readTransport.dataType = readTransport.dataType || "json";
        readTransport.method = readTransport.method || "POST";
        readTransport.contentType = readTransport.contentType || "application/json";
      } else {
        throw new Error("transport.read.url must be set to use ElasticSearchDataSource");
      }

      var _model = initOptions.schema && initOptions.schema.model;
      if (!_model) {
        throw new Error("transport.schema.model must be set to use ElasticSearchDataSource");
      }
      if (_model.esMapping) {
        _model.fields = _model.fields || {};
        data.ElasticSearchDataSource.kendoFieldsFromESMapping(
          _model.esMapping, _model, _model.fields);
      } else {
        if (!_model.fields) {
          throw new Error("transport.schema.model.fields/esMapping must be set");
        }
        fillKendoFields(_model.fields, _model);
      }

      // Get sets of nesting levels
      var _nestedFields = {};
      var _subTypes = {};
      Object.keys(_model.fields).forEach(function(fieldKey) {
        var field = _model.fields[fieldKey];
        if (field.esNestedPath) {
          _nestedFields[field.esNestedPath] = _nestedFields[field.esNestedPath] || [];
          _nestedFields[field.esNestedPath].push(field.esName);
        }
        if (field.esParentType) {
          _subTypes[field.esParentType] = _subTypes[field.esParentType] || [];
          _subTypes[field.esParentType].push(field.esName);
        }
        if (field.esChildType) {
          _subTypes[field.esChildType] = _subTypes[field.esChildType] || [];
          _subTypes[field.esChildType].push(field.esName);
        }
      });

      // Prepare the content of the query that will be sent to ES
      // based on the kendo data structure
      initOptions.transport.parameterMap = function(data) {
        var sortParams = prepareSortParams(data.sort, data.group, data.columns);

        var esParams = {};
        if (data.skip) {
          esParams.from = data.skip;
        }
        if (data.take) {
          esParams.size = data.take;
        }

        if (initOptions.aggregationsOnly) {
          esParams.from = 0;
          esParams.size = 0;
        }

        // Transform kendo sort params in a ES sort list
        esParams.sort = kendoSortToES(sortParams, _model.fields);

        // Transform kendo filters into a ES query using a query_string request
        esParams.query = {
          filtered: {
            filter: kendoFiltersToES(data.filter || [], _model.fields)
          }
        };

        // Add a top level inner_hits definition for nested/parent/child docs
        esParams.inner_hits = getESInnerHits(
          _nestedFields,
          _model.esMappingKey,
          _subTypes,
          esParams.sort,
          esParams.query.filtered.filter
        );

        // Fetch only the required list of fields from ES
        esParams._source = Object.keys(_model.fields)
          .filter(function(k) {
            return !_model.fields[k].esNestedPath && !_model.fields[k].esParentType && !_model.fields[k].esChildType;
          })
          .map(function(k) {
            return _model.fields[k].esName;
          });

        // Transform kendo aggregations into ES aggregations
        esParams.aggs = kendoAggregationToES(
          data.aggregate,
          _model.fields,
          _nestedFields,
          _model.esMappingKey,
          esParams.query.filtered.filter
        );

        // Transform Kendo group instruction into an ES bucket aggregation
        kendoGroupsToES(
          esParams.aggs,
          data.group,
          _model.fields,
          _nestedFields,
          _model.esMappingKey,
          esParams.query.filtered.filter
        );

        return JSON.stringify(esParams);
      };

      var schema = initOptions.schema;

      // Parse the results from elasticsearch to return data items,
      // total and aggregates for Kendo grid
      schema.parse = function(response) {
        var dataItems = esHitsToDataItems(response.hits.hits, _model.fields);
        var aggregates = esAggToKendoAgg(response.aggregations);
        var groups = esAggsToKendoGroups(dataItems, response.aggregations, _model.fields, initOptions.aggregationsOnly);

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

  // Transform a mapping definition from ElasticSearch into a kendo fields map
  // This utility function is exposed as it can be interesting to use it before instantiating
  // the actual datasource
  // @param mapping - An elasticsearch mapping
  data.ElasticSearchDataSource.kendoFieldsFromESMapping = function(
    mapping, model, fields, prefix, esPrefix, nestedPath) {
    fields = fields || {};
    prefix = prefix || "";
    Object.keys(mapping.properties || {}).forEach(function(propertyKey) {
      var property = mapping.properties[propertyKey];
      var curedPropertyKey = asKendoPropertyKey(propertyKey);
      var prefixedName = prefix ? prefix + "_" + curedPropertyKey : curedPropertyKey;
      var esName = esPrefix ? esPrefix + "." + propertyKey : propertyKey;

      if (property.type === "nested") {

        // Case where the property is a nested object
        var subNestedPath;

        if (nestedPath) {
          subNestedPath = nestedPath + "." + esName;
        } else {
          subNestedPath = esName;
        }

        data.ElasticSearchDataSource.kendoFieldsFromESMapping(
          property, model, fields, prefixedName, "", subNestedPath);
      } else if (property.properties) {

        // Case where the property is a non nested object with properties
        data.ElasticSearchDataSource.kendoFieldsFromESMapping(
          property, model, fields, prefixedName, esName, nestedPath);
      } else if (property.type === "object") {

        // Case where the property is a non nested object with zero subproperties. do nothing.
      } else {

        // Finally case of a leaf property
        var field = fields[prefixedName] = fields[prefixedName] || {};

        // if the field was already defined with a nested path,
        // then we are in the case of field both nested and included in parent
        // then we should not consider it as a real leaf property
        if (!field.esNestedPath) {
          field.type = field.type || property.type;

          // ES supports a variety of numeric types. In JSON and kendo it is simply 'number'.
          if (["float", "double", "integer", "long", "short", "byte"].indexOf(field.type) !== -1) {
            field.type = "number";
          }

          // Default is splitting data lines except for string fields
          if (field.type !== "string") {
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

    fillKendoFields(fields, model);

    return fields;
  };

  // Associate Kendo field names to ElasticSearch field names.
  // We have to allow ElasticSearch field names to be different
  // because ES likes an "@" and/or dots in field names while Kendo fails on that.
  // Filtering and aggregating can be based on a a different field if esFilterName
  // or esAggName are defined or on a subfield if esFilterSubField or esAggSubField are defined.
  // Typical use case is the main field is analyzed, but it has a subfield that is not
  // (or only with a minimal analyzer)
  function fillKendoFields(fields, model) {
    for (var k in fields) {
      if (fields.hasOwnProperty(k)) {
        var field = fields[k];
        field.key = k;
        field.esName = field.esName || k;
        field.esNameSplit = field.esName.split(".");
        field.esFullNestedPath = field.esNestedPath;
        if (model.esMappingKey) {
          field.esFullNestedPath = model.esMappingKey + "." + field.esFullNestedPath;
        }
        if (!field.esSearchName) {
          field.esSearchName = field.esName;
          if (field.hasOwnProperty("esSearchSubField")) {
            if (field.esSearchSubField) {
              field.esSearchName += "." + field.esSearchSubField;
            }
          } else if (field.type === "string" &&
            model.esStringSubFields &&
            model.esStringSubFields.search) {
            field.esSearchName += "." + model.esStringSubFields.search;
          }
          if (field.esNestedPath) {
            field.esSearchName = field.esNestedPath + "." + field.esSearchName;
          }
        }
        if (!field.esFilterName) {
          field.esFilterName = field.esName;
          if (field.hasOwnProperty("esFilterSubField")) {
            if (field.esFilterSubField) {
              field.esFilterName += "." + field.esFilterSubField;
            }
          } else if (field.type === "string" &&
            model.esStringSubFields &&
            model.esStringSubFields.filter) {
            field.esFilterName += "." + model.esStringSubFields.filter;
          }
          if (field.esNestedPath) {
            field.esFilterName = field.esNestedPath + "." + field.esFilterName;
          }
        }
        if (!field.esAggName) {
          field.esAggName = field.esName;
          if (field.hasOwnProperty("esAggSubField")) {
            if (field.esAggSubField) {
              field.esAggName += "." + field.esAggSubField;
            }
          } else if (field.type === "string" &&
            model.esStringSubFields &&
            model.esStringSubFields.agg) {
            field.esAggName += "." + model.esStringSubFields.agg;
          }
          if (field.esNestedPath) {
            field.esAggName = field.esFullNestedPath + "." + field.esAggName;
          }
        }
      }
    }
  }

  // Transform sort instruction into some object suitable for Elasticsearch
  // Also deal with sorting the different nesting levels
  function kendoSortToES(sort, fields, nestedPath) {
    return sort.filter(function(sortItem) {
      var field = fields[sortItem.field];
      if (!field) {
        return false;
      }
      return field.esNestedPath === nestedPath ||
        field.esParentType === nestedPath ||
        field.esChildType === nestedPath;
    }).map(function(sortItem) {
      var field = fields[sortItem.field];
      var esSortItem = {};
      esSortItem[field.esFilterName] = {
        order: sortItem.dir,
        missing: "_last",
        mode: sortItem.dir === 'asc' ? 'min' : 'max'
      };
      return esSortItem;
    });
  }

  // Transform a tree of kendo filters into a tree of ElasticSearch filters
  function kendoFiltersToES(kendoFilters, fields) {
    var filters;

    // logicalConnective can be "and" or "or"
    var logicalConnective = "and";

    if (kendoFilters.operator) {
      filters = [kendoFilters];
    } else if (kendoFilters.logic) {
      logicalConnective = kendoFilters.logic;
      filters = kendoFilters.filters || [];
    } else if (kendoFilters.constructor == Array) {
      filters = kendoFilters;
    } else {
      throw new Error("Unsupported filter object: " + kendoFilters);
    }

    var esFilters = [];

    filters.forEach(function(filter) {
      if (filter.logic) {
        esFilters.push(kendoFiltersToES(filter, fields));
      } else {
        var field = fields[filter.field];
        if (!field) {
          throw new Error("Unknown field in filter: " + filter.field);
        }
        var esFilter = {
          query: {
            query_string: {
              query: kendoFilterToESParam(filter, fields),

              // support uppercase/lowercase and accents
              analyze_wildcard: true
            }
          }
        };
        if (field.esNestedPath) {
          esFilter = {
            nested: {
              path: field.esFullNestedPath,
              filter: esFilter
            }
          };
          if (filter.operator === 'missing') {
            esFilter = {
              not: esFilter
            };
          }
        } else if (field.esParentType) {
          esFilter = {
            has_parent: {
              type: field.esParentType,
              filter: esFilter
            }
          };
          if (filter.operator === 'missing') {
            esFilter = {
              not: esFilter
            };
          }
        } else if (field.esChildType) {
          esFilter = {
            has_child: {
              type: field.esChildType,
              filter: esFilter
            }
          };
          if (filter.operator === 'missing') {
            esFilter = {
              not: esFilter
            };
          }
        }

        esFilters.push(esFilter);
      }
    });

    var result = {};
    result[logicalConnective] = {
      filters: esFilters
    };
    return result;
  }

  // Get a root inner_hits definition to fetch all nested/parent/child docs
  function getESInnerHits(nestedFields, esMappingKey, subTypes, sort, filter) {
    var innerHits = {};
    Object.keys(nestedFields).forEach(function(nestedPath) {
      var previousLevelInnerHits = innerHits;
      var previousPathParts = [];
      nestedPath.split(".").forEach(function(nestedPathPart) {
        previousPathParts.push(nestedPathPart);
        var currentPath = previousPathParts.join(".");
        var fullCurrentPath = esMappingKey ? esMappingKey + "." + currentPath : currentPath;
        var currentFields = nestedFields[currentPath];
        if (!currentFields) {
          return;
        }
        if (!previousLevelInnerHits[currentPath]) {
          previousLevelInnerHits[currentPath] = {
            path: {}
          };
          previousLevelInnerHits[currentPath].path[fullCurrentPath] = {
            _source: currentFields,
            size: 10000,
            sort: sort,
            query: {
              filtered: {
                filter: getESInnerHitsFilter(fullCurrentPath, null, filter)
              }
            }
          };
        }
        if (currentPath !== nestedPath) {
          previousLevelInnerHits[currentPath].path[fullCurrentPath].inner_hits =
            previousLevelInnerHits[currentPath].path[fullCurrentPath].inner_hits || {};
          previousLevelInnerHits =
            previousLevelInnerHits[currentPath].path[fullCurrentPath].inner_hits;
        }
      });
    });

    Object.keys(subTypes).forEach(function(subType) {
      var currentFields = subTypes[subType];
      innerHits[subType] = {
        type: {}
      };
      innerHits[subType].type[subType] = {
        _source: currentFields,
        size: 10000,
        sort: sort,
        query: {
          filtered: {
            filter: getESInnerHitsFilter(null, subType, filter)
          }
        }
      };
    });
    return innerHits;
  }

  // Traverse the filter to keep only the parts that concern
  // a nesting path
  function getESInnerHitsFilter(nestedPath, subType, filter) {
    filter = $.extend(true, {}, filter);
    var logicFilter = filter.or || filter.and;
    if (logicFilter) {
      logicFilter.filters = logicFilter.filters.filter(function(childFilter) {
        return childFilter.and || childFilter.or ||
          (childFilter.nested && childFilter.nested.path === nestedPath) ||
          (childFilter.not && childFilter.not.nested && childFilter.not.nested.path === nestedPath) ||
          (childFilter.has_child && childFilter.has_child.type === subType) ||
          (childFilter.not && childFilter.not.has_child && childFilter.not.has_child.type === subType) ||
          (childFilter.has_parent && childFilter.has_parent.type === subType) ||
          (childFilter.not && childFilter.not.has_parent && childFilter.not.has_parent.type === subType);
      }).map(function(childFilter) {
        if (childFilter.nested) {
          return childFilter.nested.filter;
        } else if (childFilter.not && childFilter.not.nested) {
          return {
            not: childFilter.not.nested.filter
          };
        } else if (childFilter.has_child) {
          return childFilter.has_child.filter;
        } else if (childFilter.not && childFilter.not.has_child) {
          return {
            not: childFilter.not.has_child.filter
          };
        } else if (childFilter.has_parent) {
          return childFilter.has_parent.filter;
        } else if (childFilter.not && childFilter.not.has_parent) {
          return {
            not: childFilter.not.has_parent.filter
          };
        } else {
          return getESInnerHitsFilter(nestedPath, childFilter);
        }
      });
    }
    return filter;
  }

  // Transform a single kendo filter in a string
  // that can be used to compose a ES query_string query
  function kendoFilterToESParam(kendoFilter, fields) {

    // Boolean filter seems to forget the operator sometimes
    kendoFilter.operator = kendoFilter.operator || 'eq';

    // Use the filter field name except for contains
    // that should use classical search instead of regexp
    var field = fields[kendoFilter.field];

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

    var fieldName;
    if (kendoFilter.operator === "search") {
      fieldName = field.esSearchName;
    } else {
      fieldName = field.esFilterName;
    }

    var fieldEscaped = asESParameter(fieldName);
    var valueEscaped = asESParameter(kendoFilter.value, kendoFilter.operator);

    var simpleBinaryOperators = {
      eq: "",
      search: "",
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
        case "contains":
          return "(" + fieldEscaped + ":*" + valueEscaped + "*)";
        case "doesnotcontain":
          return "NOT (" + fieldEscaped + ":*" + valueEscaped + "*)";
        case "startswith":
          return fieldEscaped + ":" + valueEscaped + "*";
        case "endswith":
          return fieldEscaped + ":*" + valueEscaped;
        case "missing":
          // Missing in a nested document is implemented as a "not nested exists"
          // see https://github.com/elastic/elasticsearch/issues/3495
          var expression;
          if (field.esNestedPath || field.esParentType || field.esChildType) {
            expression = "_exists_:" + fieldEscaped;
            if (field.type === "string") {
              expression += " AND NOT(" + fieldEscaped + ":\"\")";
            }
          } else {
            expression = "_missing_:" + fieldEscaped;
            if (field.type === "string") {
              expression += " OR (" + fieldEscaped + ":\"\")";
            }
          }
          return expression;
        case "exists":
          var expression = "_exists_:" + fieldEscaped;
          if (field.type === "string") {
            expression += " AND NOT(" + fieldEscaped + ":\"\")";
          }
          return expression;
        default:
          throw new Error("Unsupported Kendo filter operator: " + kendoFilter.operator);
      }
    }
  }

  var kendoToESAgg = {
    count: "cardinality",
    min: "min",
    max: "max",
    sum: "sum",
    average: "avg"
  };

  // Transform kendo aggregates into ES metric aggregations
  function kendoAggregationToES(aggregate, fields, nestedFields, esMappingKey, filter, groupNestedPath) {
    var esAggs = {};

    (aggregate ||  []).forEach(function(aggItem) {
      var field = fields[aggItem.field];
      var nestedPath = field.esNestedPath;
      var aggsWrapper = esAggs;
      if (groupNestedPath !== nestedPath) {
        var previousPathParts = [];
        if (groupNestedPath && nestedPath.indexOf(groupNestedPath) !== 0) {
          esAggs.group_reverse_nested = esAggs.group_reverse_nested || {
            reverse_nested: {},
            aggregations: {}
          };
          aggsWrapper = esAggs.group_reverse_nested.aggregations;
        } else if (groupNestedPath) {
          nestedPath = nestedPath.substr(groupNestedPath.length + 1, nestedPath.length);
        }

        nestedPath.split(".").forEach(function(nestedPathPart) {
          previousPathParts.push(nestedPathPart);
          var currentPath = groupNestedPath ? groupNestedPath + "." + previousPathParts.join(".") : previousPathParts.join(".");
          var fullCurrentPath = esMappingKey ? esMappingKey + "." + currentPath : currentPath;
          var currentFields = nestedFields[currentPath];
          if (!currentFields) {
            return;
          }
          if (!aggsWrapper[currentPath]) {
            aggsWrapper[currentPath + '_filter_nested'] = aggsWrapper[currentPath + '_filter_nested'] || {
              nested: {
                path: fullCurrentPath
              },
              aggregations: {}
            };
            aggsWrapper[currentPath + '_filter_nested'].aggregations[currentPath + '_filter'] =
              aggsWrapper[currentPath + '_filter_nested'].aggregations[currentPath + '_filter'] ||  {
                filter: getESInnerHitsFilter(fullCurrentPath, null, filter),
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

  // Transform kendo groups declaration into ES bucket aggregations
  function kendoGroupsToES(aggs, groups, fields, nestedFields, esMappingKey, filter) {
    var previousLevelAggs = [aggs];
    var previousLevelNestedPath = null;
    groups.forEach(function(group) {
      var field = fields[group.field];
      var nextLevelAggs = kendoGroupToES(group, fields, nestedFields, esMappingKey, filter);

      var aggs = {};
      if (field.esNestedPath && field.esNestedPath.indexOf(previousLevelNestedPath) !== 0) {
        aggs[field.esNestedPath + "_nested"] = aggs[field.esNestedPath + "_nested"] || {
          nested: {
            path: field.esFullNestedPath
          },
          aggs: {}
        };
        aggs[field.esNestedPath + "_nested"].aggs[group.field + "_group"] = nextLevelAggs.group;
        aggs[field.esNestedPath + "_nested"].aggs[group.field + "_missing"] = nextLevelAggs.missing;
      } else {
        aggs[group.field + "_group"] = nextLevelAggs.group;
        aggs[group.field + "_missing"] = nextLevelAggs.missing;
      } // 3rd case for nested path that is not child of the previous group

      previousLevelAggs.forEach(function(previousLevelAgg) {
        Object.keys(aggs).forEach(function(aggKey) {
          previousLevelAgg[aggKey] = aggs[aggKey];
        });
      });
      previousLevelAggs = Object.keys(nextLevelAggs).map(function(aggKey) {
        return nextLevelAggs[aggKey].aggregations;
      });
      previousLevelNestedPath = field.esNestedPath;
    });
  }

  function kendoGroupToES(group, fields, nestedFields, esMappingKey, filter) {
    var field = fields[group.field];
    var groupAgg = {};
    var missingAgg = {};

    // Look for a aggregate defined on group field
    // Used to customize the bucket aggregation for range, histograms, etc.
    var fieldAggregate;
    var groupAggregates = [];
    (group.aggregates || []).forEach(function(aggregate) {
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

    var esGroupAggregates = kendoAggregationToES(groupAggregates, fields, nestedFields, esMappingKey, filter, field.esNestedPath);
    groupAgg.aggregations = esGroupAggregates;
    missingAgg.aggregations = esGroupAggregates;

    return {
      group: groupAgg,
      missing: missingAgg
    };
  }

  // Transform aggregation results from a ES query to kendo aggregates
  function esAggToKendoAgg(aggregations, previousAggregates) {
    var aggregates = previousAggregates || {};
    aggregations = aggregations || {};
    Object.keys(aggregations).forEach(function(aggKey) {
      ["count", "min", "max", "average", "sum"].forEach(function(aggType) {
        var suffixLength = aggType.length + 1;
        if (aggKey.substr(aggKey.length - suffixLength) === "_" + aggType) {
          var fieldKey = aggKey.substr(0, aggKey.length - suffixLength);
          aggregates[fieldKey] = aggregates[fieldKey] || {};
          aggregates[fieldKey][aggType] = aggregations[aggKey].value;
        }
      });

      if (aggKey.substr(aggKey.length - 7) === "_nested" ||  aggKey.substr(aggKey.length - 7) === "_filter") {
        // recursivity on intermediate levels
        esAggToKendoAgg(aggregations[aggKey], aggregates);
      }

    });
    return aggregates;
  }

  // Extraction aggregations from ES query result that will be used to group
  // data items
  function parseGroupAggregations(aggregations) {
    var groupAggregations = Object.keys(aggregations).filter(function(aggKey) {
      return aggKey.substr(aggKey.length - 6) === "_group";
    }).map(function(aggKey) {
      var fieldKey = aggKey.substr(0, aggKey.length - 6);
      return {
        group: aggregations[aggKey],
        missing: aggregations[fieldKey + "_missing"],
        fieldKey: fieldKey
      };
    });

    // extract other group aggregations from nested aggregations
    Object.keys(aggregations).filter(function(aggKey) {
      return aggKey.substr(aggKey.length - 7) === "_nested";
    }).forEach(function(aggKey) {
      groupAggregations =
        groupAggregations.concat(parseGroupAggregations(aggregations[aggKey]));
    });

    return groupAggregations;
  }

  // Transform ES bucket aggregations into kendo groups of data items
  // See doc here for format of groups: http://docs.telerik.com/KENDO-UI/api/javascript/data/datasource#configuration-schema.groups
  function esAggsToKendoGroups(dataItems, aggregations, fields, aggregationsOnly) {
    var allGroups = [];
    if (aggregations) {
      var groupAggregations = parseGroupAggregations(aggregations);

      // Find aggregations that are grouping aggregations (ie buckets in ES)
      groupAggregations.forEach(function(groupAggregation) {
        var groups = [];

        var groupDefs = esAggToKendoGroups(
          groupAggregation.group,
          groupAggregation.missing,
          groupAggregation.fieldKey);

        if (!aggregationsOnly) {
          // Then distribute the data items in the groups
          groups = fillDataItemsInGroups(groupDefs, dataItems, fields[groupAggregation.fieldKey]);
        } else {
          groups = groupDefs.keys.map(function(key) {
            return groupDefs.map[key];
          });
        }

        // Case when there is subgroups. Solve it recursively.
        var hasSubgroups = false;
        if (groupAggregation.group.buckets && groupAggregation.group.buckets[0]) {
          Object.keys(groupAggregation.group.buckets[0]).forEach(function(bucketKey) {
            if (bucketKey.substr(bucketKey.length - 6) === "_group") {
              hasSubgroups = true;
            }
          });
        }
        groups.forEach(function(group) {
          if (hasSubgroups) {
            group.hasSubgroups = true;
            group.items = esAggsToKendoGroups(group.items, group.bucket, fields, aggregationsOnly);
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
  function esAggToKendoGroups(groupAggregation, missingAggregation, fieldKey) {
    var groupsMap = {};
    var groupKeys = [];

    // Each bucket in ES aggregation result is a group
    groupAggregation.buckets.forEach(function(bucket) {
      var bucketKey = bucket.key_as_string || bucket.key;
      groupKeys.push(bucketKey);
      groupsMap[bucketKey] = {
        field: fieldKey,
        value: bucketKey,
        hasSubgroups: false,
        aggregates: esAggToKendoAgg(bucket),
        items: [],
        bucket: bucket
      };
      groupsMap[bucketKey].aggregates[fieldKey] = {
        count: bucket.doc_count
      };
    });

    // Special case for the missing value
    groupsMap[""] = {
      field: fieldKey,
      value: "",
      hasSubgroups: false,
      aggregates: esAggToKendoAgg(missingAggregation),
      items: [],
      bucket: missingAggregation
    };
    groupsMap[""].aggregates[fieldKey] = {
      count: missingAggregation.doc_count
    };

    return {
      map: groupsMap,
      keys: groupKeys
    };
  }

  // distribute data items in groups based on a field value
  function fillDataItemsInGroups(groupDefs, dataItems, field) {
    var groups = [];
    dataItems.forEach(function(dataItem) {
      var group = groupDefs.map[dataItem[field.key] || ""];

      // If no exact match, then we may be in some range aggregation ?
      if (!group) {
        var fieldValue = field.type === 'date' ? new Date(dataItem[field.key]) : dataItem[field.key];
        for (var i = 0; i < groupDefs.keys.length; i++) {
          var groupDefValue = field.type === 'date' ? new Date(groupDefs.keys[i]) : groupDefs.keys[i];
          if (fieldValue >= groupDefValue) {
            var groupDefNextValue = groupDefs.keys[i + 1] && (field.type === 'date' ? new Date(groupDefs.keys[i + 1]) : groupDefs.keys[i + 1]);
            if (!groupDefNextValue || fieldValue < groupDefNextValue) {
              group = groupDefs.map[groupDefs.keys[i]];
            }
          }
        }
      }

      if (!group) {
        throw new Error("No group found, val: " + dataItem[field.key] + " field: " + field.key);
      }
      group.items.push(dataItem);
      if (group.items.length === 1) {
        groups.push(group);
      }
    });
    return groups;
  }

  // Mimic fetching values from _source as the 'fields' functionality
  // would have done it.
  // We do not use the native 'fields' due to this bug:
  // https://github.com/elastic/elasticsearch/issues/14475
  function getValuesFromSource(source, pathParts) {
    var values = [];
    var value = source[pathParts[0]];
    if (value === undefined) {
      return [];
    }

    if (pathParts.length > 1) {

      // recursivity is not over, there remain some path parts
      if ($.isArray(value)) {
        value.forEach(function(valueItem) {
          values = values.concat(getValuesFromSource(valueItem, pathParts.slice(1)));
        });
      } else {
        values = getValuesFromSource(value, pathParts.slice(1));
      }
    } else {

      // recursivity, we should be in a leaf value
      if ($.isArray(value)) {
        values = value;
      } else {
        values = [value];
      }
    }
    return values;
  }

  // Transform hits from the ES query in to data items for kendo grid
  // The difficulty is that hits can contain inner hits and that some
  // fields can be multi-valued
  function esHitsToDataItems(hits, fields, innerPath) {
    var dataItems = [];
    hits.forEach(function(hit) {
      var hitSource = hit._source || {};
      var dataItem = {};

      dataItem.id = [hit._id];
      Object.keys(fields).filter(function(fieldKey) {
        var field = fields[fieldKey];

        // Keep only the fields that are part of this nested/parent/child
        if (innerPath === undefined) {
          return !(field.esNestedPath || field.esChildType || field.esParentType);
        } else {
          return field.esNestedPath === innerPath ||
            field.esChildType === innerPath ||
            field.esParentType === innerPath;
        }
      }).forEach(function(fieldKey) {
        var field = fields[fieldKey];
        var values = getValuesFromSource(hitSource, field.esNameSplit);

        // special case field that is a date deep down by displayed as a number
        if (field.duration) {
          if (!moment) {
            throw new Error('Working on durations requires to load momentjs library');
          }
        }

        if (field.duration === 'beforeToday') {
          values = values.map(function(value) {
            return moment().startOf('day').diff(moment(value).startOf('day'), 'days');
          });
        }

        if (field.duration === 'afterToday') {
          values = values.map(function(value) {
            return moment(value).startOf('day').diff(moment().startOf('day'), 'days');
          });
        }

        if (values) {
          if (field.esMultiSplit) {
            if (values && values.length) {
              dataItem[fieldKey] = values;
            } else {
              dataItem[fieldKey] = [null];
            }
          } else {
            dataItem[fieldKey] = values.join(field.esMultiSeparator || "\n");
          }
        }
      });

      // Multiply and fill items based on nesting levels
      var splittedItems = [dataItem];
      Object.keys(hit.inner_hits || {}).forEach(function(innerHitKey) {
        var nestedItems =
          esHitsToDataItems(hit.inner_hits[innerHitKey].hits.hits, fields, innerHitKey);
        var newSplittedDataItems = [];
        splittedItems.forEach(function(splittedItem) {
          if (nestedItems.length) {
            nestedItems.forEach(function(nestedItem) {
              var mergedItem = {};
              Object.keys(nestedItem).forEach(function(key) {
                mergedItem[key] = nestedItem[key];
              });
              Object.keys(splittedItem).forEach(function(key) {
                mergedItem[key] = splittedItem[key];
              });
              newSplittedDataItems.push(mergedItem);
            });
          } else {
            newSplittedDataItems.push(splittedItem);
          }
        });
        splittedItems = newSplittedDataItems;
      });

      dataItems = dataItems.concat(splittedItems);

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
  var escapeValueRegexp = /[+\-&|!()\{}\[\]^:"~*?:\/ ]/g;
  var escapeSearchValueRegexp = /[+\-&|!()\{}\[\]^::\/]/g;

  function asESParameter(value, operator) {
    if (value.constructor == Date) {
      value = value.toISOString();
    } else if (typeof value === "boolean" || typeof value === "number") {
      value = "" + value;
    }

    // For the special 'search' operator we allow some wildcard and other characters
    if (operator === 'search') {
      value = value.replace("\\", "\\\\");
      if (((value.match(/"/g) || []).length % 2) === 1) {
        value = value.replace(/"/g, '\\"');
      }
      value = value.replace(escapeSearchValueRegexp, "\\$&")
      return value;
    }
    return value.replace("\\", "\\\\").replace(escapeValueRegexp, "\\$&");
  }

  // Get a property key and transform it in a suitable key for kendo
  // the constraint is that kendo needs a key suitable for javascript object's dot notation
  // i.e a valid js identifier with alphanumeric chars + '_' and '$'
  function asKendoPropertyKey(value) {
    return value.replace(/[^a-zA-z0-9_$]/g, "_");
  }

  // Prepare sort parameters for easier transformation to ES later on
  function prepareSortParams(sort, groups) {
    // first fix the type of the param that can be object of group
    var sortArray = [];
    if (sort && sort.constructor == Array) {
      sortArray = sort;
    } else {
      if (sort) {
        sortArray.push(sort);
      }
    }

    // Sort instructions for the groups are first
    var fullSort = [];
    (groups || []).forEach(function(group) {
      var matchingSort = sortArray.filter(function(sortItem) {
        return sortItem.field === group.field;
      });
      if (matchingSort.length) {
        fullSort.push(matchingSort[0]);
        sortArray.splice(sortArray.indexOf(matchingSort[0]), 1);
      } else {
        fullSort.push({
          field: group.field,
          dir: group.dir ||  'asc'
        });
      }
    });

    // Then original sort instructions are added
    fullSort = fullSort.concat(sortArray);

    return fullSort;
  }

})(window.jQuery, window.kendo);
