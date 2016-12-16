/**
 * A Kendo DataSource that gets its data from ElasticSearch.
 *
 * Read-only, supports paging, filtering, sorting, grouping and aggregations.
 */

import * as sort from './sort';
import * as groups from './groups';
import * as aggregations from './aggregations';
import * as filters from './filters';
import * as esUtils from './es-utils';
import * as dataItems from './data-items';
import * as fields from './fields';

const data = kendo.data;

data.ElasticSearchDataSource = data.DataSource.extend({
  init(initOptions) {
    if (!initOptions) {
      throw new Error('Options are required to use ElasticSearchDataSource');
    }

    // Prepare the transport to query ES
    // The only required parameter is transport.read.url
    if (initOptions.transport && initOptions.transport.read && initOptions.transport.read.url) {
      const readTransport = initOptions.transport.read;
      readTransport.dataType = readTransport.dataType || 'json';
      readTransport.method = readTransport.method || 'POST';
      readTransport.contentType = readTransport.contentType || 'application/json';
    } else {
      throw new Error('transport.read.url must be set to use ElasticSearchDataSource');
    }

    const _model = initOptions.schema && initOptions.schema.model;
    if (!_model) {
      throw new Error('transport.schema.model must be set to use ElasticSearchDataSource');
    }
    if (_model.esMapping) {
      _model.fields = _model.fields || {};
      data.ElasticSearchDataSource.kendoFieldsFromESMapping(
        _model.esMapping, _model, _model.fields);
    } else {
      if (!_model.fields) {
        throw new Error('transport.schema.model.fields/esMapping must be set');
      }
      fields.fill(_model.fields, _model);
    }

    // Get sets of nesting levels
    const [_nestedFields, _subTypes] = fields.nestedFields(_model.fields);
    console.log(fields);

    // Prepare the content of the query that will be sent to ES
    // based on the kendo data structure
    initOptions.transport.parameterMap = function (data) {
      const sortParams = sort.prepareParams(data.sort, data.group, data.columns);

      const esParams = {};
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
          filter: filters.kendo2es(data.filter || [], _model.fields)
        }
      };

      // Add a top level inner_hits definition for nested/parent/child docs
      esParams['inner_hits'] = esUtils.innerHits(
        _nestedFields,
        _model.esMappingKey,
        _subTypes,
        esParams.sort,
        esParams.query.filtered.filter
      );

      // Fetch only the required list of fields from ES
      esParams._source = Object.keys(_model.fields)
        .filter(k =>
          !_model.fields[k].esNestedPath &&
          !_model.fields[k].esParentType &&
          !_model.fields[k].esChildType)
        .map(k => _model.fields[k].esName);

      // Transform kendo aggregations into ES aggregations
      esParams.aggs = aggregations.kendo2es(
        data.aggregate,
        _model.fields,
        _nestedFields,
        _model.esMappingKey,
        esParams.query.filtered.filter
      );

      // Transform Kendo group instruction into an ES bucket aggregation
      groups.kendo2es(
        esParams.aggs,
        data.group,
        _model.fields,
        _nestedFields,
        _model.esMappingKey,
        esParams.query.filtered.filter
      );

      return JSON.stringify(esParams);
    };

    const schema = initOptions.schema;

    // Parse the results from elasticsearch to return data items,
    // total and aggregates for Kendo grid
    schema.parse = function (response) {
      const items = dataItems.fromHits(response.hits.hits, _model.fields);

      // cheat. Root aggregations used as a pseudo buckets with doc_count = total number of results
      // used to process missing counts
      if (response.aggregations) {
        response.aggregations.doc_count = response.hits.total;
      }
      const aggregates = aggregations.es2kendo(response.aggregations);
      const grps = groups.es2kendo(items, response.aggregations, _model.fields, initOptions.aggregationsOnly);

      return {
        total: response.hits.total,
        data: items,
        aggregates: aggregates,
        groups: grps
      };
    };

    schema.aggregates = response => response.aggregates;
    schema.groups = response => response.groups;

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
