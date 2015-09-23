// This script will add some data to a local elasticsearch instance for demos

var jsf = require('json-schema-faker');
var elasticsearch = require('elasticsearch');
var personSchema = require('./person-schema');
var indexDefinition = require('./index-definition');

var client = new elasticsearch.Client({
  host: 'http://localhost:9200'
});
var index = 'kendo-elasticsearch-demo';

var nbPersons = 1000;
var bulkPersons = '';
for (var i = 0; i < nbPersons; i++) {
  bulkPersons += JSON.stringify({
    index: {
      _index: 'kendo-elasticsearch-demo',
      _type: 'person'
    }
  });
  bulkPersons += '\n';
  bulkPersons += JSON.stringify(jsf(personSchema));
  bulkPersons += '\n';
}

console.log('Prepared bulk query with %s random persons', nbPersons);
//console.log(bulkPersons);

// Create index then use bulk to index a bunch of documents
client.indices.exists({
  index: index
}).then(function(exists) {
  if (exists) {
    client.indices.delete({
      index: index
    });
  }
}).then(function() {
  return client.indices.create({
    index: index,
    body: indexDefinition
  });
}).then(function() {
  return client.bulk({
    index: index,
    body: bulkPersons
  });
}).then(function(response) {
  console.log('Created %s persons.', nbPersons);
  process.exit();
}, function(err) {
  console.error('Failed to create persons - %s', err);
  process.exit(-1);
});
