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
        var readTrasnsport = initOptions.transport.read;
        readTrasnsport.dataType = readTrasnsport.dataType || "json";
        readTrasnsport.method = readTrasnsport.method || "POST";
        readTrasnsport.contentType = readTrasnsport.contentType || "application/json";
      } else {
        throw new Error("transport.read.url must be set to use ElasticSearchDataSource");
      }

      var _model = initOptions.schema && initOptions.schema.model;
      if (!_model) {
        throw new Error("transport.schema.model must be set to use ElasticSearchDataSource");
      }
      if (_model.esMapping) {
        _model.fields = _model.fields || {};
        data.ElasticSearchDataSource.kendoFieldsFromESMapping(_model.esMapping, _model.fields);
      }

      var _fields = this._fields = _model.fields;
      if (!_fields) {
        throw new Error("transport.schema.model.fields/esMapping must be set");
      }

      // Associate Kendo field names to ElasticSearch field names.
      // We have to allow ElasticSearch field names to be different
      // because ES likes an "@" and/or dots in field names while Kendo fails on that.
      // Filtering and aggregating can be based on a a different field if esFilterName
      // or esAggName are defined or on a subfield if esFilterSubField or esAggSubField are defined.
      // Typical use case is the main field is analyzed, but it has a subfield that is not
      // (or only with a minimal analyzer)
      for (var k in _fields) {
        if (_fields.hasOwnProperty(k)) {
          var field = _fields[k];
          field.esName = field.esName || k;
          field.esNameSplit = field.esName.split(".");
          if (!field.esSearchName) {
            field.esSearchName = field.esName;
            if (field.hasOwnProperty("esSearchSubField")) {
              if (field.esSearchSubField) {
                field.esSearchName += "." + field.esSearchSubField;
              }
            } else if (field.type === "string" &&
              _model.esStringSubFields &&
              _model.esStringSubFields.search) {
              field.esSearchName += "." + _model.esStringSubFields.search;
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
              _model.esStringSubFields &&
              _model.esStringSubFields.filter) {
              field.esFilterName += "." + _model.esStringSubFields.filter;
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
              _model.esStringSubFields &&
              _model.esStringSubFields.agg) {
              field.esAggName += "." + _model.esStringSubFields.agg;
            }
            if (field.esNestedPath) {
              field.esAggName = field.esNestedPath + "." + field.esAggName;
            }
          }
        }
      }

      // Get sets of nesting levels
      var _nestedFields = {};
      var _subTypes = {};
      Object.keys(_fields).forEach(function(fieldKey) {
        var field = _fields[fieldKey];
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
        esParams.query = {
          filtered: {
            filter: kendoFiltersToES(data.filter || [], _fields)
          }
        };

        // Add a top level inner_hits definition for nested/parent/child docs
        esParams.inner_hits = getESInnerHits(
          _nestedFields, _subTypes, esParams.sort, esParams.query.filtered.filter);

        // Fetch only the required list of fields from ES
        esParams._source = Object.keys(_fields)
          .filter(function(k) {
            return !_fields[k].esNestedPath && !_fields[k].esParentType && !_fields[k].esChildType;
          })
          .map(function(k) {
            return _fields[k].esName;
          });

        // Transform kendo aggregations into ES aggregations
        esParams.aggs = kendoAggregationToES(data.aggregate, _fields);

        // Transform Kendo group instruction into an ES bucket aggregation
        kendoGroupsToES(esParams.aggs, data.group, _fields);

        return JSON.stringify(esParams);
      };

      var schema = initOptions.schema;

      // Parse the results from elasticsearch to return data items,
      // total and aggregates for Kendo grid
      schema.parse = function(response) {
        var dataItems = esHitsToDataItems(response.hits.hits, _fields);
        var aggregates = esAggToKendoAgg(response.aggregations);
        var groups = esAggsToKendoGroups(dataItems, response.aggregations);

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
  data.ElasticSearchDataSource.kendoFieldsFromESMapping = function(
    mapping, fields, prefix, esPrefix, nestedPath) {
    fields = fields || {};
    prefix = prefix || "";
    Object.keys(mapping.properties || {}).forEach(function(propertyKey) {
      var property = mapping.properties[propertyKey];
      var curedPropertyKey = asKendoPropertyKey(propertyKey);
      var prefixedName = prefix ? prefix + "_" + curedPropertyKey : curedPropertyKey;

      if (property.type === "nested") {

        // Case where the property is a nested object
        var subNestedPath = nestedPath ? nestedPath + "." + propertyKey : propertyKey;
        data.ElasticSearchDataSource
          .kendoFieldsFromESMapping(property, fields, prefixedName, "", subNestedPath);
      } else if (property.properties) {

        // Case where the property is a non nested object with properties
        var subEsPrefix = esPrefix ? esPrefix + "." + propertyKey : propertyKey;
        data.ElasticSearchDataSource
          .kendoFieldsFromESMapping(property, fields, prefixedName, subEsPrefix, nestedPath);
      } else if (property.type === "object") {

        // Case where the property is a non nested object with zero subproperties. do nothing.
      } else {

        // Finally case of a leaf property
        var field = fields[prefixedName] = fields[prefixedName] || {};

        // the field was already defined with a nested path,
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
          field.esName = esPrefix ? esPrefix + "." + propertyKey : propertyKey;
        }
      }
    });

    return fields;
  };

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
        order: sortItem.dir,
        missing: "_last"
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

              // lowercase terms from wildcards as they are not analyzed
              lowercase_expanded_terms: true
            }
          }
        };
        if (field.esNestedPath) {
          esFilter = {
            nested: {
              path: field.esNestedPath,
              filter: esFilter
            }
          };
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
  function getESInnerHits(nestedFields, subTypes, sort, filter) {
    var innerHits = {};
    Object.keys(nestedFields).forEach(function(nestedPath) {
      var previousLevelInnerHits = innerHits;
      var previousPathParts = [];
      nestedPath.split(".").forEach(function(nestedPathPart) {
        previousPathParts.push(nestedPathPart);
        var currentPath = previousPathParts.join(".");
        var currentFields = nestedFields[currentPath];
        if (!currentFields) {
          return;
        }
        if (!previousLevelInnerHits[currentPath]) {
          previousLevelInnerHits[currentPath] = {
            path: {}
          };
          previousLevelInnerHits[currentPath].path[currentPath] = {
            _source: currentFields,
            size: 10000,
            sort: sort,
            query: {
              filtered: {
                filter: getESInnerHitsFilter(currentPath, null, filter)
              }
            }
          };
        }
        if (currentPath !== nestedPath) {
          previousLevelInnerHits[currentPath].path[currentPath].inner_hits =
            previousLevelInnerHits[currentPath].path[currentPath].inner_hits || {};
          previousLevelInnerHits = previousLevelInnerHits[currentPath].path[currentPath].inner_hits;
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
    logicFilter.filters = logicFilter.filters.filter(function(childFilter) {
      return childFilter.and || childFilter.or ||
        (childFilter.nested && childFilter.nested.path === nestedPath) ||
        (childFilter.has_child && childFilter.has_child.type === subType) ||
        (childFilter.has_parent && childFilter.has_parent.type === subType);
    }).map(function(childFilter) {
      if (childFilter.nested) {
        return childFilter.nested.filter;
      } else if (childFilter.has_child) {
        return childFilter.has_child.filter;
      } else if (childFilter.has_parent) {
        return childFilter.has_parent.filter;
      } else {
        return getESInnerHitsFilter(nestedPath, childFilter);
      }
    });
    return filter;
  }

  // Transform a single kendo filter in a string
  // that can be used to compose a ES query_string query
  function kendoFilterToESParam(kendoFilter, fields) {

    // Use the filter field name except for contains
    // that should use classical search instead of regexp
    var field;
    if (kendoFilter.operator === "search") {
      field = fields[kendoFilter.field].esSearchName;
    } else {
      field = fields[kendoFilter.field].esFilterName;
    }

    var fieldEscaped = asESParameter(field);
    var valueEscaped = asESParameter(kendoFilter.value);

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
  function kendoGroupsToES(aggs, groups, fields) {
    var previousLevelAggs = [aggs];
    groups.forEach(function(group) {
      var nextLevelAggs = kendoGroupToES(group, fields);
      previousLevelAggs.forEach(function(previousLevelAgg) {
        Object.keys(nextLevelAggs).forEach(function(nextLevelAggKey) {
          previousLevelAgg[nextLevelAggKey] = nextLevelAggs[nextLevelAggKey];
        });
      });
      previousLevelAggs = Object.keys(nextLevelAggs).map(function(nextLevelAggKey) {
        return nextLevelAggs[nextLevelAggKey].aggregations;
      });
    });
  }

  function kendoGroupToES(group, fields) {
    var field = fields[group.field];
    var aggs = {};
    var groupAgg;
    var missingAgg;
    if (field.esNestedPath) {
      aggs[field.esNestedPath + "_nested"] = aggs[field.esNestedPath + "_nested"] || {
        nested: {
          path: field.esNestedPath
        },
        aggs: {}
      };
      groupAgg = aggs[field.esNestedPath + "_nested"].aggs[group.field + "_group"] = {};
      missingAgg = aggs[field.esNestedPath + "_nested"].aggs[group.field + "_missing"] = {};
    } else {
      groupAgg = aggs[group.field + "_group"] = {};
      missingAgg = aggs[group.field + "_missing"] = {};
    }

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

    missingAgg.missing = {
      field: field.esAggName
    };

    var esGroupAggregates = group.aggregates ? kendoAggregationToES(groupAggregates, fields) : {};
    groupAgg.aggregations = esGroupAggregates;
    missingAgg.aggregations = esGroupAggregates;

    return aggs;
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
  function esAggsToKendoGroups(dataItems, aggregations) {
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

        // Then distribute the data items in the groups
        groups = fillDataItemsInGroups(groupDefs, dataItems, groupAggregation.fieldKey);

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
            group.items = esAggsToKendoGroups(group.items, group.bucket);
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
      items: []
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
  function fillDataItemsInGroups(groupDefs, dataItems, fieldKey) {
    var groups = [];
    dataItems.forEach(function(dataItem) {
      var group = groupDefs.map[dataItem[fieldKey] || ""];

      // If no exact match, then we may be in some range aggregation ?
      if (!group) {
        for (var i = 0; i < groupDefs.keys.length; i++) {
          if (dataItem[fieldKey] >= groupDefs.keys[i]) {
            if (!groupDefs.keys[i + 1] || dataItem[fieldKey] < groupDefs.keys[i + 1]) {
              group = groupDefs.map[groupDefs.keys[i]];
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
    return groups;
  }

  // Mimic fetching values from _source as the 'fields' functionality
  // would have done it.
  // We do not use the native 'fields' due to this bug:
  // https://github.com/elastic/elasticsearch/issues/14475
  function getValuesFromSource(source, pathParts) {
    var values;
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
        if (field.esMultiSplit) {
          dataItem[fieldKey] = values;
        } else {
          dataItem[fieldKey] = values.join(field.esMultiSeparator || ";");
        }
      });

      var nestedItems = [];
      Object.keys(hit.inner_hits || {}).forEach(function(innerHitKey) {
        nestedItems = nestedItems
          .concat(esHitsToDataItems(hit.inner_hits[innerHitKey].hits.hits, fields, innerHitKey));
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

  // Get a property key and transform it in a suitable key for kendo
  // the constraint is that kendo needs a key suitable for javascript object's dot notation
  // i.e a valid js identifier with alphanumeric chars + '_' and '$'
  function asKendoPropertyKey(value) {
    return value.replace(/[^a-zA-z0-9_$]/g, "_");
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
