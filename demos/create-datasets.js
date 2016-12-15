// This script will add some data to a local elasticsearch instance for demos

var jsf = require('json-schema-faker');
var elasticsearch = require('elasticsearch');
var personSchema = require('./person-schema');
var organizationSchema = require('./organization-schema');
var indexDefinition = require('./index-definition');

// These variables are parameters for the following

var client = new elasticsearch.Client({
  host: 'http://localhost:9200',
  apiVersion: '1.7'
});
var index = 'kendo-elasticsearch-demo';
var nbOrganizations = 1000;
var nbPersons = 10000;

// Let's prepare some bodies fof Elasticsearch bulk requests

var bulkOrganizations = '';
for (var i = 0; i < nbOrganizations; i++) {
  bulkOrganizations += JSON.stringify({
    index: {
      _index: 'kendo-elasticsearch-demo',
      _type: 'organization',
      _id: i
    }
  });
  bulkOrganizations += '\n';
  bulkOrganizations += JSON.stringify(jsf(organizationSchema));
  bulkOrganizations += '\n';
}

console.log('Prepared bulk query with %s random organizations', nbOrganizations);

var bulkPersons = '';
for (var i = 0; i < nbPersons; i++) {
  bulkPersons += JSON.stringify({
    index: {
      _index: 'kendo-elasticsearch-demo',
      _type: 'person',
      _id: i,
      parent: Math.floor(Math.random() * nbOrganizations)
    }
  });
  bulkPersons += '\n';
  bulkPersons += JSON.stringify(jsf(personSchema));
  bulkPersons += '\n';
}

console.log('Prepared bulk query with %s random persons', nbPersons);

// Create index then use bulk to index a bunch of documents
client.indices.exists({
  index: index
}).then(function (exists) {
  if (exists) {
    client.indices.delete({
      index: index
    });
  }
}).then(function () {
  return client.indices.create({
    index: index,
    body: indexDefinition
  });
}).then(function () {
  return client.bulk({
    index: index,
    body: bulkOrganizations
  });
}).then(function () {
  return client.bulk({
    index: index,
    body: bulkPersons
  });
}).then(function (response) {
  console.log('Created %s organizations and %s persons.', nbOrganizations, nbPersons);
  process.exit();
}, function (err) {
  console.error('Failed to create datasets', err);
  process.exit(-1);
});
