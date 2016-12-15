import * as sort from '../../src/sort';
import * as assert from 'assert';
const fields = require('../resources/fields');

describe('sort utility functions', () => {
  it('should transform a simple kendo sort param', () => {

    const kendoSort = [{
      field: 'addresses_city',
      dir: 'desc'
    }, {
      field: 'companyName',
      dir: 'asc'
    }, {
      field: 'addresses_country',
      dir: 'asc'
    }];
    const esSort = sort.kendo2es(kendoSort, fields);
    assert.equal(esSort.length, 3);
    assert.ok(esSort[0]['addresses.city.lowercase']);
    assert.equal(esSort[0]['addresses.city.lowercase'].order, 'desc');
    assert.equal(esSort[0]['addresses.city.lowercase'].missing, '_last');
    assert.equal(esSort[0]['addresses.city.lowercase'].mode, 'max');
    assert.equal(esSort[1]['companyName.lowercase'].order, 'asc');
    assert.equal(esSort[1]['companyName.lowercase'].missing, '_last');
    assert.equal(esSort[1]['companyName.lowercase'].mode, 'min');
  });

  it('should parse kendo sort options', () => {

    const kendoSortArray = [{
      field: 'addresses_country',
      dir: 'asc'
    }, {
      field: 'addresses_city',
      dir: 'desc'
    }];

    const kendoGroups = [{
      field: 'addresses_city',
      dir: 'asc'
    }];

    const kendoSortObject = {
      field: 'addresses_country',
      dir: 'asc'
    };

    const parsedParamsFromArray = sort.prepareParams(kendoSortArray, kendoGroups);
    assert.equal(parsedParamsFromArray[0]['field'], 'addresses_city');

    const parsedParamsFromObject = sort.prepareParams(kendoSortObject, kendoGroups);
    assert.equal(parsedParamsFromObject[0]['field'], 'addresses_city');
    assert.equal(parsedParamsFromObject[1]['field'], 'addresses_country');

  });
});
