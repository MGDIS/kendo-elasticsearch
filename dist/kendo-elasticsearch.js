(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("kendo-elasticsearch", [], factory);
	else if(typeof exports === 'object')
		exports["kendo-elasticsearch"] = factory();
	else
		root["kendo-elasticsearch"] = factory();
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }(); /**
	                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          * A Kendo DataSource that gets its data from ElasticSearch.
	                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          *
	                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          * Read-only, supports paging, filtering, sorting, grouping and aggregations.
	                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          */
	
	var _sort = __webpack_require__(1);
	
	var sort = _interopRequireWildcard(_sort);
	
	var _groups = __webpack_require__(2);
	
	var groups = _interopRequireWildcard(_groups);
	
	var _aggregations = __webpack_require__(3);
	
	var aggregations = _interopRequireWildcard(_aggregations);
	
	var _filters = __webpack_require__(6);
	
	var filters = _interopRequireWildcard(_filters);
	
	var _esUtils = __webpack_require__(4);
	
	var esUtils = _interopRequireWildcard(_esUtils);
	
	var _dataItems = __webpack_require__(5);
	
	var dataItems = _interopRequireWildcard(_dataItems);
	
	var _fields = __webpack_require__(7);
	
	var fields = _interopRequireWildcard(_fields);
	
	function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }
	
	var data = kendo.data;
	
	data.ElasticSearchDataSource = data.DataSource.extend({
	  init: function init(initOptions) {
	    if (!initOptions) {
	      throw new Error('Options are required to use ElasticSearchDataSource');
	    }
	
	    // Prepare the transport to query ES
	    // The only required parameter is transport.read.url
	    if (initOptions.transport && initOptions.transport.read && initOptions.transport.read.url) {
	      var readTransport = initOptions.transport.read;
	      readTransport.dataType = readTransport.dataType || 'json';
	      readTransport.method = readTransport.method || 'POST';
	      readTransport.contentType = readTransport.contentType || 'application/json';
	    } else {
	      throw new Error('transport.read.url must be set to use ElasticSearchDataSource');
	    }
	
	    var _model = initOptions.schema && initOptions.schema.model;
	    if (!_model) {
	      throw new Error('transport.schema.model must be set to use ElasticSearchDataSource');
	    }
	    if (_model.esMapping) {
	      _model.fields = _model.fields || {};
	      data.ElasticSearchDataSource.kendoFieldsFromESMapping(_model.esMapping, _model, _model.fields);
	    } else {
	      if (!_model.fields) {
	        throw new Error('transport.schema.model.fields/esMapping must be set');
	      }
	      fields.fill(_model.fields, _model);
	    }
	
	    // Get sets of nesting levels
	
	    var _fields$nestedFields = fields.nestedFields(_model.fields),
	        _fields$nestedFields2 = _slicedToArray(_fields$nestedFields, 2),
	        _nestedFields = _fields$nestedFields2[0],
	        _subTypes = _fields$nestedFields2[1];
	
	    console.log(fields);
	
	    // Prepare the content of the query that will be sent to ES
	    // based on the kendo data structure
	    initOptions.transport.parameterMap = function (data) {
	      var sortParams = sort.prepareParams(data.sort, data.group, data.columns);
	
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
	      esParams.sort = sort.kendo2es(sortParams, _model.fields);
	
	      // Transform kendo filters into a ES query using a query_string request
	      esParams.query = {
	        filtered: {
	          filter: filters.kendo2es(data.filter || [], _model.fields, initOptions)
	        }
	      };
	
	      // Add a top level inner_hits definition for nested/parent/child docs
	      esParams['inner_hits'] = esUtils.innerHits(_nestedFields, _model.esMappingKey, _subTypes, esParams.sort, esParams.query.filtered.filter);
	
	      // Fetch only the required list of fields from ES
	      esParams._source = Object.keys(_model.fields).filter(function (k) {
	        return !_model.fields[k].esNestedPath && !_model.fields[k].esParentType && !_model.fields[k].esChildType;
	      }).map(function (k) {
	        return _model.fields[k].esName;
	      });
	
	      // Transform kendo aggregations into ES aggregations
	      esParams.aggs = aggregations.kendo2es(data.aggregate, _model.fields, _nestedFields, _model.esMappingKey, esParams.query.filtered.filter);
	
	      // Transform Kendo group instruction into an ES bucket aggregation
	      groups.kendo2es(esParams.aggs, data.group, _model.fields, _nestedFields, _model.esMappingKey, esParams.query.filtered.filter);
	
	      return JSON.stringify(esParams);
	    };
	
	    var schema = initOptions.schema;
	
	    // Parse the results from elasticsearch to return data items,
	    // total and aggregates for Kendo grid
	    schema.parse = function (response) {
	      var items = dataItems.fromHits(response.hits.hits, _model.fields);
	
	      // cheat. Root aggregations used as a pseudo buckets with doc_count = total number of results
	      // used to process missing counts
	      if (response.aggregations) {
	        response.aggregations.doc_count = response.hits.total;
	      }
	      var aggregates = aggregations.es2kendo(response.aggregations);
	      var grps = groups.es2kendo(items, response.aggregations, _model.fields, initOptions.aggregationsOnly);
	
	      return {
	        total: response.hits.total,
	        data: items,
	        aggregates: aggregates,
	        groups: grps
	      };
	    };
	
	    schema.aggregates = function (response) {
	      return response.aggregates;
	    };
	    schema.groups = function (response) {
	      return response.groups;
	    };
	
	    schema.data = schema.data || 'data';
	    schema.total = schema.total || 'total';
	    schema.model.id = schema.model.id || '_id';
	
	    initOptions.serverFiltering = true;
	    initOptions.serverSorting = true;
	    initOptions.serverPaging = true;
	    initOptions.serverAggregates = true;
	    initOptions.serverGrouping = true;
	
	    data.DataSource.fn.init.call(this, initOptions);
	  }
	});
	
	data.ElasticSearchDataSource.kendoFieldsFromESMapping = fields.fromMapping;

/***/ },
/* 1 */
/***/ function(module, exports) {

	'use strict';
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	
	function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
	
	var kendo2es = exports.kendo2es = _kendo2es;
	var prepareParams = exports.prepareParams = _prepareParams;
	
	// Transform sort instruction into some object suitable for Elasticsearch
	// Also deal with sorting the different nesting levels
	function _kendo2es(sort, fields, nestedPath) {
	  return sort.filter(function (sortItem) {
	    var field = fields[sortItem.field];
	    if (!field) return false;
	    return field.esNestedPath === nestedPath || field.esParentType === nestedPath || field.esChildType === nestedPath;
	  }).map(function (sortItem) {
	    return _defineProperty({}, fields[sortItem.field].esFilterName, {
	      order: sortItem.dir,
	      // Always put items without the sorted key at the end
	      missing: '_last',
	      // Deal with sorting items by a property in nested documents
	      mode: sortItem.dir === 'asc' ? 'min' : 'max'
	    });
	  });
	};
	
	// Prepare sort parameters for easier transformation to ES later on
	function _prepareParams(sort) {
	  var groups = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
	
	  // first fix the type of the param that can be object of group
	  // we always parse as an array
	  // http://docs.telerik.com/kendo-ui/api/javascript/data/datasource#configuration-sort
	  var sortArray = [];
	  if (sort && sort.constructor === Array) {
	    sortArray = sort;
	  } else {
	    if (sort) {
	      sortArray.push(sort);
	    }
	  }
	
	  // Sort instructions for the groups are first
	  var fullSort = [];
	  groups.forEach(function (group) {
	    var matchingSort = sortArray.filter(function (sortItem) {
	      return sortItem.field === group.field;
	    });
	    if (matchingSort.length) {
	      fullSort.push(matchingSort[0]);
	      sortArray.splice(sortArray.indexOf(matchingSort[0]), 1);
	    } else {
	      // Sort by default
	      fullSort.push({
	        field: group.field,
	        dir: group.dir || 'asc'
	      });
	    }
	  });
	
	  // Then original sort instructions are added
	  fullSort = fullSort.concat(sortArray);
	
	  return fullSort;
	}

/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	exports.es2kendo = exports.kendo2es = undefined;
	
	var _aggregations = __webpack_require__(3);
	
	var aggregations = _interopRequireWildcard(_aggregations);
	
	var _dataItems = __webpack_require__(5);
	
	var dataItems = _interopRequireWildcard(_dataItems);
	
	function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }
	
	var kendo2es = exports.kendo2es = _kendo2es;
	var es2kendo = exports.es2kendo = _es2kendo;
	
	// Transform kendo groups declaration into ES bucket aggregations
	function _kendo2es(aggs, groups, fields, nestedFields, esMappingKey, filter) {
	  var previousLevelAggs = [aggs];
	  var previousLevelNestedPath = null;
	  groups.forEach(function (group) {
	    var field = fields[group.field];
	    var nextLevelAggs = _kendoGroup2es(group, fields, nestedFields, esMappingKey, filter);
	
	    var aggs = {};
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
	
	    previousLevelAggs.forEach(function (previousLevelAgg) {
	      Object.keys(aggs).forEach(function (aggKey) {
	        previousLevelAgg[aggKey] = aggs[aggKey];
	      });
	    });
	    previousLevelAggs = Object.keys(nextLevelAggs).map(function (aggKey) {
	      return nextLevelAggs[aggKey].aggregations;
	    });
	    previousLevelNestedPath = field.esNestedPath;
	  });
	}
	
	function _kendoGroup2es(group, fields, nestedFields, esMappingKey, filter) {
	  var field = fields[group.field];
	  var groupAgg = {};
	  var missingAgg = {};
	
	  // Look for a aggregate defined on group field
	  // Used to customize the bucket aggregation for range, histograms, etc.
	  var fieldAggregate = void 0;
	  var groupAggregates = [];
	  (group.aggregates || []).forEach(function (aggregate) {
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
	
	  var esGroupAggregates = aggregations.kendo2es(groupAggregates, fields, nestedFields, esMappingKey, filter, field.esNestedPath);
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
	  var groupAggregations = Object.keys(aggregations).filter(function (aggKey) {
	    return aggKey.substr(aggKey.length - 6) === '_group';
	  }).map(function (aggKey) {
	    var fieldKey = aggKey.substr(0, aggKey.length - 6);
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
	  Object.keys(aggregations).filter(function (aggKey) {
	    return aggKey.substr(aggKey.length - 7) === '_nested';
	  }).forEach(function (aggKey) {
	    // 'missing' count on a nested group aggregation =
	    //      'document without nested objects' + 'nested objects with missing field'
	    // and 'document without nested objects' is equal to 'number of documents' - 'number of nested documents'
	    var missingNested = aggregations.doc_count - aggregations[aggKey].doc_count;
	    groupAggregations = groupAggregations.concat(_parseGroupAggregations(aggregations[aggKey], missingNested));
	  });
	
	  return groupAggregations;
	}
	
	// Transform ES bucket aggregations into kendo groups of data items
	// See doc here for format of groups:
	// http://docs.telerik.com/KENDO-UI/api/javascript/data/datasource#configuration-schema.groups
	function _es2kendo(items, aggregations, fields, aggregationsOnly) {
	  var allGroups = [];
	  if (aggregations) {
	    var groupAggregations = _parseGroupAggregations(aggregations);
	
	    // Find aggregations that are grouping aggregations (ie buckets in ES)
	    groupAggregations.forEach(function (groupAggregation) {
	      var groups = [];
	
	      var groupDefs = _esAgg2kendo(groupAggregation.group, groupAggregation.missing, groupAggregation.fieldKey);
	
	      if (!aggregationsOnly) {
	        // Then distribute the data items in the groups
	        groups = dataItems.fillInGroups(groupDefs, items, fields[groupAggregation.fieldKey]);
	      } else {
	        groups = groupDefs.keys.map(function (key) {
	          return groupDefs.map[key];
	        });
	      }
	
	      // Case when there is subgroups. Solve it recursively.
	      var hasSubgroups = false;
	      if (groupAggregation.group.buckets && groupAggregation.group.buckets[0]) {
	        Object.keys(groupAggregation.group.buckets[0]).forEach(function (bucketKey) {
	          if (bucketKey.substr(bucketKey.length - 6) === '_group' || bucketKey.substr(bucketKey.length - 7) === '_nested') {
	            hasSubgroups = true;
	          }
	        });
	      }
	      groups.forEach(function (group) {
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
	  var groupsMap = {};
	  var groupKeys = [];
	
	  // Each bucket in ES aggregation result is a group
	  groupAggregation.buckets.forEach(function (bucket) {
	    var bucketKey = bucket.key_as_string || bucket.key;
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

/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	exports.es2kendo = exports.kendo2es = undefined;
	
	var _esUtils = __webpack_require__(4);
	
	var esUtils = _interopRequireWildcard(_esUtils);
	
	function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }
	
	var kendo2es = exports.kendo2es = _kendo2es;
	var es2kendo = exports.es2kendo = _es2kendo;
	
	var kendoToESAgg = {
	  count: 'cardinality',
	  min: 'min',
	  max: 'max',
	  sum: 'sum',
	  average: 'avg'
	};
	
	// Transform kendo aggregates into ES metric aggregations
	function _kendo2es() {
	  var aggregate = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
	  var fields = arguments[1];
	  var nestedFields = arguments[2];
	  var esMappingKey = arguments[3];
	  var filter = arguments[4];
	  var groupNestedPath = arguments[5];
	
	  var esAggs = {};
	
	  aggregate.forEach(function (aggItem) {
	    var field = fields[aggItem.field];
	    var nestedPath = field.esNestedPath;
	    var aggsWrapper = esAggs;
	    if (groupNestedPath !== nestedPath) {
	      (function () {
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
	
	        nestedPath.split('.').forEach(function (nestedPathPart) {
	          previousPathParts.push(nestedPathPart);
	          var currentPath = groupNestedPath ? groupNestedPath + '.' + previousPathParts.join('.') : previousPathParts.join('.');
	          var fullCurrentPath = esMappingKey ? esMappingKey + '.' + currentPath : currentPath;
	          var currentFields = nestedFields[currentPath];
	          if (!currentFields) return;
	          if (!aggsWrapper[currentPath]) {
	            aggsWrapper[currentPath + '_filter_nested'] = aggsWrapper[currentPath + '_filter_nested'] || {
	              nested: {
	                path: fullCurrentPath
	              },
	              aggregations: {}
	            };
	            aggsWrapper[currentPath + '_filter_nested'].aggregations[currentPath + '_filter'] = aggsWrapper[currentPath + '_filter_nested'].aggregations[currentPath + '_filter'] || {
	              filter: esUtils.innerHitsFilter(fullCurrentPath, null, filter),
	              aggregations: {}
	            };
	          }
	          aggsWrapper = aggsWrapper[currentPath + '_filter_nested'].aggregations[currentPath + '_filter'].aggregations;
	        });
	      })();
	    }
	
	    aggsWrapper[aggItem.field + '_' + aggItem.aggregate] = {};
	    aggsWrapper[aggItem.field + '_' + aggItem.aggregate][kendoToESAgg[aggItem.aggregate]] = {
	      field: field.esAggName
	    };
	  });
	
	  return esAggs;
	}
	
	// Transform aggregation results from a ES query to kendo aggregates
	function _es2kendo() {
	  var aggregations = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
	  var aggregates = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	
	  Object.keys(aggregations).forEach(function (aggKey) {
	    if (!aggregations[aggKey]) return;
	    ['count', 'min', 'max', 'average', 'sum'].forEach(function (aggType) {
	      var suffixLength = aggType.length + 1;
	      if (aggKey.substr(aggKey.length - suffixLength) === '_' + aggType) {
	        var fieldKey = aggKey.substr(0, aggKey.length - suffixLength);
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

/***/ },
/* 4 */
/***/ function(module, exports) {

	'use strict';
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	
	function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
	
	// Some function that work on ES queries to deal with nested levels and other
	// difficulties
	
	var innerHits = exports.innerHits = _innerHits;
	var innerHitsFilter = exports.innerHitsFilter = _innerHitsFilter;
	
	// Get a root inner_hits definition to fetch all nested/parent/child docs
	function _innerHits(nestedFields, esMappingKey, subTypes, sort, filter) {
	  var innerHits = {};
	  Object.keys(nestedFields).forEach(function (nestedPath) {
	    var previousLevelInnerHits = innerHits;
	    var previousPathParts = [];
	    nestedPath.split('.').forEach(function (nestedPathPart) {
	      previousPathParts.push(nestedPathPart);
	      var currentPath = previousPathParts.join('.');
	      var fullCurrentPath = esMappingKey ? esMappingKey + '.' + currentPath : currentPath;
	      var currentFields = nestedFields[currentPath];
	      if (!currentFields) {
	        return;
	      }
	      if (!previousLevelInnerHits[currentPath]) {
	        previousLevelInnerHits[currentPath] = {
	          path: _defineProperty({}, fullCurrentPath, {
	            _source: currentFields,
	            size: 10000,
	            sort: sort,
	            query: {
	              filtered: {
	                filter: _innerHitsFilter(fullCurrentPath, null, filter)
	              }
	            }
	          })
	        };
	      }
	      if (currentPath !== nestedPath) {
	        previousLevelInnerHits[currentPath].path[fullCurrentPath].inner_hits = previousLevelInnerHits[currentPath].path[fullCurrentPath].inner_hits || {};
	        previousLevelInnerHits = previousLevelInnerHits[currentPath].path[fullCurrentPath].inner_hits;
	      }
	    });
	  });
	
	  Object.keys(subTypes).forEach(function (subType) {
	    var currentFields = subTypes[subType];
	    innerHits[subType] = {
	      type: _defineProperty({}, subType, {
	        _source: currentFields,
	        size: 10000,
	        sort: sort,
	        query: {
	          filtered: {
	            filter: _innerHitsFilter(null, subType, filter)
	          }
	        }
	      })
	    };
	  });
	  return innerHits;
	}
	
	// Traverse the filter to keep only the parts that concern
	// a nesting path
	function _innerHitsFilter(nestedPath, subType, filter) {
	  filter = $.extend(true, {}, filter);
	  var logicFilter = filter.or || filter.and;
	  if (logicFilter) {
	    logicFilter.filters = logicFilter.filters.filter(function (childFilter) {
	      return childFilter.and || childFilter.or || childFilter.nested && childFilter.nested.path === nestedPath || childFilter.not && childFilter.not.nested && childFilter.not.nested.path === nestedPath || childFilter.has_child && childFilter.has_child.type === subType || childFilter.not && childFilter.not.has_child && childFilter.not.has_child.type === subType || childFilter.has_parent && childFilter.has_parent.type === subType || childFilter.not && childFilter.not.has_parent && childFilter.not.has_parent.type === subType;
	    }).map(function (childFilter) {
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
	        return _innerHitsFilter(nestedPath, childFilter);
	      }
	    });
	  }
	  return filter;
	}

/***/ },
/* 5 */
/***/ function(module, exports) {

	'use strict';
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	var fillInGroups = exports.fillInGroups = _fillInGroups;
	var fromHits = exports.fromHits = _fromHits;
	
	// distribute data items in groups based on a field value
	function _fillInGroups(groupDefs, dataItems, field) {
	  var groups = [];
	  dataItems.forEach(function (dataItem) {
	    var group = groupDefs.map[dataItem[field.key] || ''];
	
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
	      throw new Error('No group found, val: ' + dataItem[field.key] + ' field: ' + field.key);
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
	function _getValuesFromSource(source, pathParts) {
	  var values = [];
	  var value = source[pathParts[0]];
	  if (value === undefined) {
	    return [];
	  }
	
	  if (pathParts.length > 1) {
	
	    // recursivity is not over, there remain some path parts
	    if ($.isArray(value)) {
	      value.forEach(function (valueItem) {
	        values = values.concat(_getValuesFromSource(valueItem, pathParts.slice(1)));
	      });
	    } else {
	      values = _getValuesFromSource(value, pathParts.slice(1));
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
	function _fromHits(hits, fields, innerPath) {
	
	  var dataItems = [];
	  hits.forEach(function (hit) {
	    var hitSource = hit._source || {};
	    var dataItem = {};
	
	    dataItem.id = [hit._id];
	    Object.keys(fields).filter(function (fieldKey) {
	      var field = fields[fieldKey];
	
	      // Keep only the fields that are part of this nested/parent/child
	      if (innerPath === undefined) {
	        return !(field.esNestedPath || field.esChildType || field.esParentType);
	      } else {
	        return field.esNestedPath === innerPath || field.esChildType === innerPath || field.esParentType === innerPath;
	      }
	    }).forEach(function (fieldKey) {
	      var field = fields[fieldKey];
	      var values = _getValuesFromSource(hitSource, field.esNameSplit);
	
	      // special case field that is a date deep down by displayed as a number
	      if (field.duration) {
	        if (!moment) {
	          throw new Error('Working on durations requires to load momentjs library');
	        }
	      }
	
	      if (field.duration === 'beforeToday') {
	        values = values.map(function (value) {
	          return moment().startOf('day').diff(moment(value).startOf('day'), 'days');
	        });
	      }
	
	      if (field.duration === 'afterToday') {
	        values = values.map(function (value) {
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
	          dataItem[fieldKey] = values.join(field.esMultiSeparator || '\n');
	        }
	      }
	    });
	
	    // Multiply and fill items based on nesting levels
	    var splittedItems = [dataItem];
	    Object.keys(hit.inner_hits || {}).forEach(function (innerHitKey) {
	      var nestedItems = _fromHits(hit.inner_hits[innerHitKey].hits.hits, fields, innerHitKey);
	      var newSplittedDataItems = [];
	      splittedItems.forEach(function (splittedItem) {
	        if (nestedItems.length) {
	          nestedItems.forEach(function (nestedItem) {
	            var mergedItem = {};
	            Object.keys(nestedItem).forEach(function (key) {
	              mergedItem[key] = nestedItem[key];
	            });
	            Object.keys(splittedItem).forEach(function (key) {
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
	  return _splitMultiValues(dataItems);
	}
	
	// Split lines of data items based on their optionally multipl items
	// Example: [{a:[1,2],b:[3]}] -> [{a:1,b:3},{a:2,b:3}]
	function _splitMultiValues(items) {
	  var results = [];
	
	  // Iterates on items in the array and multiply based on multiple values
	  items.forEach(function (item) {
	    var itemResults = [{}];
	
	    // Iterate on properties of item
	    Object.keys(item).forEach(function (k) {
	      var partialItemResults = [];
	
	      // Iterate on the multiple values of this property
	      if (item[k] && item[k].constructor === Array) {
	        item[k].forEach(function (val) {
	          itemResults.forEach(function (result) {
	
	            // Clone the result to create variants with the different values of current key
	            var newResult = {};
	            Object.keys(result).forEach(function (k2) {
	              return newResult[k2] = result[k2];
	            });
	            newResult[k] = val;
	            partialItemResults.push(newResult);
	          });
	        });
	      } else {
	        itemResults.forEach(function (result) {
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

/***/ },
/* 6 */
/***/ function(module, exports) {

	'use strict';
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	var kendo2es = exports.kendo2es = _kendo2es;
	
	// Transform a tree of kendo filters into a tree of ElasticSearch filters
	function _kendo2es(kendoFilters, fields, initOptions) {
	  var filters = void 0;
	
	  // logicalConnective can be "and" or "or"
	  var logicalConnective = 'and';
	
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
	
	  var esFilters = [];
	  var esNestedFilters = {};
	
	  filters.forEach(function (filter) {
	    if (filter.logic) {
	      esFilters.push(_kendo2es(filter, fields));
	    } else {
	      var field = fields[filter.field];
	      if (!field) {
	        throw new Error('Unknown field in filter: ' + filter.field);
	      }
	      var esFilter = {
	        query: {
	          query_string: {
	            query: _filterParam(filter, fields, initOptions),
	            // support uppercase/lowercase and accents
	            analyze_wildcard: true
	          }
	        }
	      };
	      if (field.esNestedPath) {
	        var esNestedFilter = esNestedFilters[field.esNestedPath] || {
	          nested: {
	            path: field.esFullNestedPath,
	            filter: {}
	          }
	        };
	        esNestedFilter.nested.filter[logicalConnective] = esNestedFilter.nested.filter[logicalConnective] || {
	          filters: []
	        };
	        esNestedFilter.nested.filter[logicalConnective].filters.push(esFilter);
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
	
	  var result = {};
	  result[logicalConnective] = {
	    filters: esFilters
	  };
	  return result;
	}
	
	// Transform a single kendo filter in a string
	// that can be used to compose a ES query_string query
	function _filterParam(kendoFilter, fields, initOptions) {
	
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
	    if (kendoFilter.operator === 'lt') kendoFilter.operator = 'gt';else if (kendoFilter.operator === 'lte') kendoFilter.operator = 'gte';else if (kendoFilter.operator === 'gt') kendoFilter.operator = 'lt';else if (kendoFilter.operator === 'gte') kendoFilter.operator = 'lte';
	  }
	
	  if (field.duration === 'afterToday') {
	    kendoFilter.value = moment().startOf('day').add(kendoFilter.value, 'days').format();
	  }
	
	  var fieldName = void 0;
	  if (kendoFilter.operator === 'search') {
	    fieldName = field.esSearchName;
	  } else {
	    fieldName = field.esFilterName;
	  }
	
	  var fieldEscaped = _asESParameter(fieldName);
	  var valueEscaped = _asESParameter(kendoFilter.value, kendoFilter.operator);
	
	  var simpleBinaryOperators = {
	    eq: '',
	    search: '',
	    lt: '<',
	    lte: '<=',
	    gt: '>',
	    gte: '>='
	  };
	
	  if (simpleBinaryOperators[kendoFilter.operator] !== void 0) {
	    var esOperator = simpleBinaryOperators[kendoFilter.operator];
	    // Optional special condition, when comparing against bool false values
	    // we treat also the missing property condition, like this, false === missing too
	    // Event if this is not true, normally is the desired effect
	    if (initOptions && initOptions.missingBooleanAsFalse === true && kendoFilter.value === false) {
	      return fieldEscaped + ':' + esOperator + valueEscaped + ' OR _missing_:' + fieldEscaped;
	    } else {
	      return fieldEscaped + ':' + esOperator + valueEscaped;
	    }
	  } else {
	    var expression = void 0;
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
	var escapeValueRegexp = /[+\-&|!()\{}\[\]^:"~*?:\/ ]/g;
	var escapeSearchValueRegexp = /[+\-&|!()\{}\[\]^:~:\/]/g;
	
	function _asESParameter(value, operator) {
	  if (value.constructor === Date) {
	    value = value.toISOString();
	  } else if (typeof value === 'boolean' || typeof value === 'number') {
	    value = '' + value;
	  }
	
	  // For the special 'search' operator we allow some wildcard and other characters
	  if (operator === 'search') {
	    value = value.replace('\\', '\\\\');
	    if ((value.match(/"/g) || []).length % 2 === 1) {
	      value = value.replace(/"/g, '\\"');
	    }
	    value = value.replace(escapeSearchValueRegexp, '\\$&');
	    return value;
	  }
	  return value.replace('\\', '\\\\').replace(escapeValueRegexp, '\\$&');
	}

/***/ },
/* 7 */
/***/ function(module, exports) {

	'use strict';
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	var fromMapping = exports.fromMapping = _fromMapping;
	var fill = exports.fill = _fill;
	var nestedFields = exports.nestedFields = _nestedFields;
	
	// Transform a mapping definition from ElasticSearch into a kendo fields map
	// This utility function is exposed as it can be interesting to use it before instantiating
	// the actual datasource
	// @param mapping - An elasticsearch mapping
	function _fromMapping(mapping, model) {
	  var fields = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
	  var prefix = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : '';
	  var esPrefix = arguments[4];
	  var nestedPath = arguments[5];
	
	  Object.keys(mapping.properties || {}).forEach(function (propertyKey) {
	    var property = mapping.properties[propertyKey];
	    var curedPropertyKey = asKendoPropertyKey(propertyKey);
	    var prefixedName = prefix ? prefix + '_' + curedPropertyKey : curedPropertyKey;
	    var esName = esPrefix ? esPrefix + '.' + propertyKey : propertyKey;
	
	    if (property.type === 'nested') {
	      // Case where the property is a nested object
	      var subNestedPath = nestedPath ? nestedPath + '.' + esName : esName;
	      _fromMapping(property, model, fields, prefixedName, '', subNestedPath);
	    } else if (property.properties) {
	      // Case where the property is a non nested object with properties
	      _fromMapping(property, model, fields, prefixedName, esName, nestedPath);
	    } else if (property.type === 'object') {
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
	function _fill(fields) {
	  var model = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	
	  for (var k in fields) {
	    if (fields.hasOwnProperty(k)) {
	      var field = fields[k];
	      field.key = k;
	      field.esName = field.esName || k;
	      field.esNameSplit = field.esName.split('.');
	      if (field.esNestedPath) {
	        field.esFullNestedPath = field.esNestedPath;
	        if (model.esMappingKey) {
	          field.esFullNestedPath = model.esMappingKey + '.' + field.esFullNestedPath;
	        }
	      }
	      if (!field.esSearchName) {
	        field.esSearchName = field.esName;
	        if (field.hasOwnProperty('esSearchSubField')) {
	          if (field.esSearchSubField) {
	            field.esSearchName += '.' + field.esSearchSubField;
	          }
	        } else if (field.type === 'string' && model.esStringSubFields && model.esStringSubFields.search) {
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
	        } else if (field.type === 'string' && model.esStringSubFields && model.esStringSubFields.filter) {
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
	        } else if (field.type === 'string' && model.esStringSubFields && model.esStringSubFields.agg) {
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
	
	// Get sets of nesting levels and matching groups of fields
	function _nestedFields(fields) {
	  var _result = {};
	  var _subTypes = {};
	  Object.keys(fields).forEach(function (fieldKey) {
	    var field = fields[fieldKey];
	    if (field.esNestedPath) {
	      _result[field.esNestedPath] = _result[field.esNestedPath] || [];
	      _result[field.esNestedPath].push(field.esName);
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
	
	  return [_result, _subTypes];
	}

/***/ }
/******/ ])
});
;
//# sourceMappingURL=kendo-elasticsearch.js.map