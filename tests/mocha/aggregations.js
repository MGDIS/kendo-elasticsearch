import * as aggregations from '../../src/aggregations';
import * as fieldUtils from '../../src/fields';
import * as assert from 'assert';

const fields = require('../resources/fields');
const [nestedFields] = fieldUtils.nestedFields(fields);

describe('aggregations utility functions', () => {
  it('should transform a simple kendo aggregate', () => {
    const aggregates = [{
      field: 'companyName',
      aggregate: 'count'
    }];

    const aggs = aggregations.kendo2es(aggregates, fields, nestedFields, 'organization');
    assert.equal(aggs.companyName_count.cardinality.field, 'companyName.raw');
  });
});
