/**
 * A Kendo DataSource that gets its data from ElasticSearch.
 *
 * Read-only, supports paging, filtering and sorting.
 */
(function($, kendo) {
  'use strict';

  var data = kendo.data;

  // Helper functions for conversion of query parameters from Kendo to ElasticSearch format
  function arrayify(myArg) {
    var _argArray = [];

    if (myArg && myArg.constructor == Array) {
      _argArray = myArg;
    } else {
      if (!(myArg === void 0))
        _argArray.push(myArg);
    }

    return _argArray;
  }

  data.ElasticSearchDataSource = data.DataSource.extend({
    init: function(initOptions) {
      var self = this;

      if (!initOptions.transport || !initOptions.transport.read || !initOptions.transport.read.url)
        throw new Error('transport.read.url must be set to use ElasticSearchDataSource');

      initOptions.transport.read.dataType = initOptions.transport.read.dataType || 'json';
      initOptions.transport.read.method = initOptions.transport.read.method || 'POST';
      initOptions.transport.read.contentType = initOptions.transport.read.contentType || 'application/json';

      // Create a map mapping Kendo field names to ElasticSearch field names. We have to allow ElasticSearch field
      // names to be different because ES likes an "@" in field names while Kendo fails on that.
      // Filtering and aggregating can be based on a subfield if esFilterSubField or esAggSubField are specified.
      // Typical use case is the main field is analyzed, but it has a subfield that is not (or only with a minimal analyzer)
      var fields = initOptions.schema.model.fields;
      this._esFieldMap = [];
      this._esFilterFieldMap = [];
      this._esAggFieldMap = [];
      for (var k in fields) {
        if (fields.hasOwnProperty(k)) {
          this._esFieldMap[k] = fields[k].hasOwnProperty('esName') ? fields[k].esName : k;
          this._esFilterFieldMap[k] = fields[k].hasOwnProperty('esFilterSubField') ? this._esFieldMap[k] + '.' + fields[k].esFilterSubField : this._esFieldMap[k];
          this._esAggFieldMap[k] = fields[k].hasOwnProperty('esAggSubField') ? this._esFieldMap[k] + '.' + fields[k].esAggSubField : this._esFieldMap[k];
        }
      }

      initOptions.transport.parameterMap = function(data, type) {
        var sortParams = arrayify(data.sort);

        var esParams = {};
        if (data.skip) esParams.from = data.skip;
        if (data.take) esParams.size = data.take;

        // Transform kendo sort params in a ES sort list
        esParams.sort = sortParams.map(function(sortItem) {
          var esSortItem = {};
          esSortItem[self._esFieldMap[sortParams[0].field]] = {
            order: sortParams[0].dir
          }
          return esSortItem;
        });

        // Transform kendo filters into a ES query using a query_string request
        if (data.filter) {
          esParams.query = {
            filtered: {
              filter: {
                query: {
                  query_string: {
                    query: self._kendoFilterToESParam(data.filter),
                    lowercase_expanded_terms: true,
                    default_operator: 'AND'
                  }
                }
              }
            }
          };
        }

        // Fetch only the required list of fields from ES
        esParams.fields = Object.keys(self._esFieldMap).map(function(k) {
          return self._esFieldMap[k];
        });
        esParams._source = false;

        // Transform kendo aggregations into ES aggregations
        esParams.aggs = self._kendoAggregationToES(data.aggregate);

        return JSON.stringify(esParams);
      };

      var schema = initOptions.schema;

      // Parse the results from elasticsearch to return data items, total and aggregates for Kendo grid
      schema.parse = function(response) {
        var hits = response.hits.hits;
        var dataItems = [];
        for (var i = 0; i < hits.length; i++) {
          var hitFields = hits[i].fields || {};
          var dataItem = {};

          dataItem.id = hits[i]._id;
          for (var k in self._esFieldMap) {
            dataItem[k] = (hitFields[self._esFieldMap[k]] || []).join('\n');
          }

          dataItems.push(dataItem);
        }

        var aggregates = {};
        if (response.aggregations) {
          Object.keys(response.aggregations).forEach(function(aggKey) {
            ['count', 'min', 'max', 'average', 'sum'].forEach(function(aggType) {
              var suffixLength = aggType.length + 1;
              if (aggKey.substr(aggKey.length - suffixLength) === '_' + aggType) {
                var fieldKey = aggKey.substr(0, aggKey.length - suffixLength);
                aggregates[fieldKey] = aggregates[fieldKey] || {};
                aggregates[fieldKey][aggType] = response.aggregations[aggKey].value;
              }
            });
          });
        }

        return {
          total: response.hits.total,
          data: dataItems,
          aggregates: aggregates
        };
      };

      schema.aggregates = function(response) {
        return response.aggregates;
      };

      schema.data = schema.data || 'data';
      schema.total = schema.total || 'total';
      schema.model.id = schema.model.id || '_id';

      initOptions.serverFiltering = true;
      initOptions.serverSorting = true;
      initOptions.serverPaging = true;
      initOptions.serverAggregates = true;

      data.DataSource.fn.init.call(this, initOptions);
    },

    _kendoFilterToESParam: function(kendoFilterObj) {
      // there are three possible structures for the kendoFilterObj:
      //  * {value: "...", operator: "...", field: " ..."}
      //  * {logic: "...", filters: ...}
      //  * [ ... ]

      if (kendoFilterObj.operator) {
        return this._kendoOperatorFilterToESParam(kendoFilterObj);
      } else if (kendoFilterObj.logic) {
        return this._kendoFilterListToESParam(kendoFilterObj.logic, kendoFilterObj.filters);
      } else if (kendoFilterObj.constructor == Array) {
        return this._kendoFilterListToESParam("and", kendoFilterObj.filters);
      } else {
        throw new Error("Don't know how to turn this Kendo filter object into ElasticSearch search parameter: " + kendoFilterObj);
      }
    },

    _kendoOperatorFilterToESParam: function(kendoFilterObj) {
      // Add the subfield suffix except for contains that should use classical search instead of regexp
      var field = kendoFilterObj.operator === 'contains' ? this._esFieldMap[kendoFilterObj.field] : this._esFilterFieldMap[kendoFilterObj.field];

      var fieldEscaped = this._asESParameter(field);
      var valueEscaped = this._asESParameter(kendoFilterObj.value);

      var simpleBinaryOperators = {
        eq: "",
        contains: "",
        lt: "<",
        lte: "<=",
        gt: ">",
        gte: ">="
      };

      if (simpleBinaryOperators[kendoFilterObj.operator] !== void 0) {
        var esOperator = simpleBinaryOperators[kendoFilterObj.operator];
        return fieldEscaped + ":" + esOperator + valueEscaped;
      } else {
        switch (kendoFilterObj.operator) {
          case "neq":
            return "NOT (" + fieldEscaped + ":" + valueEscaped + ")";
          case "startswith":
            return fieldEscaped + ":" + valueEscaped + "*";
          case "endswith":
            return fieldEscaped + ":*" + valueEscaped;
          default:
            throw new Error("Kendo search operator '" + kendoFilterObj.operator + "' is not yet supported");
        }
      }
    },

    // logicalConnective can be "and" or "or"
    _kendoFilterListToESParam: function(logicalConnective, filters) {
      var esParams = [];

      for (var i = 0; i < filters.length; i++) {
        esParams.push(" (" + this._kendoFilterToESParam(filters[i]) + ") ");
      }

      return esParams.join(logicalConnective.toUpperCase())
    },

    _asESParameter: function(value) {
      if (value.constructor == Date)
        value = value.toISOString();

      return value.replace("\\", "\\\\").replace(/[+\-&|!()\{}\[\]^:"~*?:\/ ]/g, "\\$&");
    },

    _kendoAggregationToES: function(aggregate) {
      var self = this;
      var esAggs = {};

      var kendoToESAgg = {
        count: 'cardinality',
        min: 'min',
        max: 'max',
        sum: 'sum',
        average: 'avg'
      };

      if (aggregate && aggregate.length > 0) {
        esAggs = {};

        aggregate.forEach(function(aggItem) {
          var field = self._esAggFieldMap[aggItem.field];

          esAggs[aggItem.field + '_' + aggItem.aggregate] = {};
          esAggs[aggItem.field + '_' + aggItem.aggregate][kendoToESAgg[aggItem.aggregate]] = {
            field: field
          };
        });
      }

      return esAggs;
    }
  });

})(window.jQuery, window.kendo);
