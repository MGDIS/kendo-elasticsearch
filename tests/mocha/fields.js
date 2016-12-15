import * as fieldUtils from '../../src/fields';
import * as assert from 'assert';

const mapping = require('../resources/mapping');
const model = {
  esStringSubFields: {
    filter: 'lowercase',
    agg: 'raw'
  },
  esMappingKey: 'organization'
};

describe('fields utility functions', () => {
  it('should transform an ES mapping into a map of kendo fields', () => {
    const fields = fieldUtils.fromMapping(mapping, model);
    assert.equal(fields.companyName.esName, 'companyName');
    assert.equal(fields.addresses_zipCode.esNestedPath, 'addresses');
    assert.equal(fields.addresses_zipCode.esName, 'zipCode');
    assert.equal(fields.addresses_zipCode.esFullNestedPath, 'organization.addresses');
    assert.equal(fields.addresses_zipCode.esSearchName, 'addresses.zipCode');
    assert.equal(fields.addresses_zipCode.esFilterName, 'addresses.zipCode.lowercase');
    assert.equal(fields.addresses_zipCode.esAggName, 'organization.addresses.zipCode.raw');
  });

  it('should group fields definitions by nesting levels', () => {
    const fields = fieldUtils.fromMapping(mapping, model);
    const [nestedFields] = fieldUtils.nestedFields(fields);
    assert.ok(nestedFields.accounts);
    assert.ok(nestedFields.addresses);
    assert.ok(nestedFields['addresses.telephones']);
  });
});
