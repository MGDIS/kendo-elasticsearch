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

    assert.equal(esFilters.bool.must[0].query.query_string.query, '(companyName.lowercase:*Dani*)');
    assert.equal(esFilters.bool.must[0].query.query_string.analyze_wildcard, true);

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

    assert.equal(esFilters.bool.must[0].nested.path, 'organization.addresses');
    assert.equal(esFilters.bool.must[0].nested.filter.bool.must[0].query.query_string.query, '(addresses.city.lowercase:*Alej*)');
    assert.equal(esFilters.bool.must[0].nested.filter.bool.must[0].query.query_string.analyze_wildcard, true);
  });

  it('should transform a nested kendo "missing" filter', () => {

    const kendoFilters = {
      logic: 'and',
      filters: [{
        field: 'addresses_city',
        operator: 'missing',
        value: 'Alej'
      }]
    };

    const esFilters = filters.kendo2es(kendoFilters, fields);

    assert.equal(esFilters.bool.must_not[0].nested.path, 'organization.addresses');
    assert.equal(esFilters.bool.must_not[0].nested.filter.not.exists.field, 'organization.addresses.city');
  });

  it('should transform a complex kendo filter', () => {
    const kendoFilters = {
      logic: 'and',
      filters: [
        {
          field: 'companyName',
          operator: 'contains',
          value: 'Dani'
        },
        {
          logic: 'or',
          filters: [
            {
              field: 'addresses_city',
              operator: 'contains',
              value: 'Alej'
            },
            {
              field: 'addresses_city',
              operator: 'contains',
              value: 'view'
            }
          ]
        }
      ]
    };

    const esFilters = filters.kendo2es(kendoFilters, fields);

    assert.equal(esFilters.bool.must[0].query.query_string.query, '(companyName.lowercase:*Dani*)');

    assert.equal(esFilters.bool.must[1].bool.should[0].nested.path, 'organization.addresses');

    assert.equal(esFilters.bool.must[1].bool.should[0].nested.filter.bool.should[0].query.query_string.query,
      '(addresses.city.lowercase:*Alej*)');

    assert.equal(esFilters.bool.must[1].bool.should[0].nested.filter.bool.should[1].query.query_string.query,
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

    const mustBoolQueries = esFilters.bool.must.map(
      filter => filter.query && filter.query.query_string && filter.query.query_string.query);
    const nestedAndQueries = esFilters.bool.must[9].nested.filter.bool.must.map(
      filter => filter.query && filter.query.query_string && filter.query.query_string.query);

    // contains
    assert.equal(mustBoolQueries[0], '(companyName.lowercase:*Dani*)');
    // search
    assert.equal(mustBoolQueries[1], 'companyName:Dani');
    // eq
    assert.equal(mustBoolQueries[2], 'companyName.lowercase:Dani');
    // neq
    assert.equal(mustBoolQueries[3], 'NOT (companyName.lowercase:Dani)');
    // doesnotcontain
    assert.equal(mustBoolQueries[4], 'NOT (companyName.lowercase:*Dani*)');
    // startswith
    assert.equal(mustBoolQueries[5], 'companyName.lowercase:Dani*');
    // endswith
    assert.equal(mustBoolQueries[6], 'companyName.lowercase:*Dani');
    // missing
    assert.equal(mustBoolQueries[7], '_missing_:companyName.lowercase OR (companyName.lowercase:"")');
    // exists
    assert.equal(mustBoolQueries[8], '_exists_:companyName.lowercase AND NOT(companyName.lowercase:"")');
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
