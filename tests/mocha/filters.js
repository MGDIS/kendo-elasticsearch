import * as filters from '../../src/filters';
import * as assert from 'assert';
const fields = require('../resources/fields');

describe('filters utility functions', () => {
  it('should transform a simple kendo filter', () => {

    const kendoFilters = {
      logic: 'and',
      filters: [{
        field: 'companyName',
        operator: 'contains',
        value: 'Dani'
      }]
    };

    const esFilters = filters.kendo2es(kendoFilters, fields);

    assert.equal(esFilters.and.filters[0].query.query_string.query, '(companyName.lowercase:*Dani*)');
    assert.equal(esFilters.and.filters[0].query.query_string.analyze_wildcard, true);

  });

  it('should transform a nested kendo filter', () => {

    const kendoFilters = {
      logic: 'and',
      filters: [{
        field: 'addresses_city',
        operator: 'contains',
        value: 'Alej'
      }]
    };

    const esFilters = filters.kendo2es(kendoFilters, fields);

    assert.equal(esFilters.and.filters[0].nested.path, 'organization.addresses');
    assert.equal(esFilters.and.filters[0].nested.filter.and.filters[0].query.query_string.query,
      '(addresses.city.lowercase:*Alej*)');
    assert.equal(esFilters.and.filters[0].nested.filter.and.filters[0].query.query_string.analyze_wildcard, true);

  });

  it('should transform a complex kendo filter', () => {

    const kendoFilters = {
      logic: 'and',
      filters: [{
        field: 'companyName',
        operator: 'contains',
        value: 'Dani'
      }, {
        logic: 'or',
        filters: [{
          field: 'addresses_city',
          operator: 'contains',
          value: 'Alej'
        }, {
          field: 'addresses_city',
          operator: 'contains',
          value: 'view'
        }]
      }]
    };

    const esFilters = filters.kendo2es(kendoFilters, fields);

    assert.equal(esFilters.and.filters[0].query.query_string.query, '(companyName.lowercase:*Dani*)');

    assert.equal(esFilters.and.filters[1].or.filters[0].nested.path, 'organization.addresses');

    assert.equal(esFilters.and.filters[1].or.filters[0].nested.filter.or.filters[0].query.query_string.query,
      '(addresses.city.lowercase:*Alej*)');

    assert.equal(esFilters.and.filters[1].or.filters[0].nested.filter.or.filters[1].query.query_string.query,
      '(addresses.city.lowercase:*view*)');

  });

  it('should transform a kendo filter with various operators', () => {

    const kendoFilters = {
      logic: 'and',
      filters: [{
        field: 'companyName',
        operator: 'contains',
        value: 'Dani'
      }, {
        field: 'companyName',
        operator: 'search',
        value: 'Dani'
      }, {
        field: 'companyName',
        operator: 'eq',
        value: 'Dani'
      }, {
        field: 'companyName',
        operator: 'neq',
        value: 'Dani'
      }, {
        field: 'companyName',
        operator: 'doesnotcontain',
        value: 'Dani'
      }, {
        field: 'companyName',
        operator: 'startswith',
        value: 'Dani'
      }, {
        field: 'companyName',
        operator: 'endswith',
        value: 'Dani'
      }, {
        field: 'companyName',
        operator: 'missing',
        value: ''
      }, {
        field: 'companyName',
        operator: 'exists',
        value: ''
      }, {
        field: 'accounts_amount',
        operator: 'eq',
        value: 1
      }, {
        field: 'accounts_amount',
        operator: 'lt',
        value: 1
      }, {
        field: 'accounts_amount',
        operator: 'lte',
        value: 1
      }, {
        field: 'accounts_amount',
        operator: 'gt',
        value: 1
      }, {
        field: 'accounts_amount',
        operator: 'gte',
        value: 1
      }]
    };

    const esFilters = filters.kendo2es(kendoFilters, fields);

    const andQueries = esFilters.and.filters.map(
      filter => filter.query && filter.query.query_string && filter.query.query_string.query);
    const nestedAndQueries = esFilters.and.filters[9].nested.filter.and.filters.map(
      filter => filter.query && filter.query.query_string && filter.query.query_string.query);

    // contains
    assert.equal(andQueries[0], '(companyName.lowercase:*Dani*)');
    // search
    assert.equal(andQueries[1], 'companyName:Dani');
    // eq
    assert.equal(andQueries[2], 'companyName.lowercase:Dani');
    // neq
    assert.equal(andQueries[3], 'NOT (companyName.lowercase:Dani)');
    // doesnotcontain
    assert.equal(andQueries[4], 'NOT (companyName.lowercase:*Dani*)');
    // startswith
    assert.equal(andQueries[5], 'companyName.lowercase:Dani*');
    // endswith
    assert.equal(andQueries[6], 'companyName.lowercase:*Dani');
    // missing
    assert.equal(andQueries[7], '_missing_:companyName.lowercase OR (companyName.lowercase:"")');
    // exists
    assert.equal(andQueries[8], '_exists_:companyName.lowercase AND NOT(companyName.lowercase:"")');
    // eq
    assert.equal(nestedAndQueries[0], 'accounts.amount:1');
    // lt
    assert.equal(nestedAndQueries[1], 'accounts.amount:<1');
    // lte
    assert.equal(nestedAndQueries[2], 'accounts.amount:<=1');
    // gt
    assert.equal(nestedAndQueries[3], 'accounts.amount:>1');
    // gte
    assert.equal(nestedAndQueries[4], 'accounts.amount:>=1');

  });
});
