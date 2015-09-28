# kendo-elasticsearch

A Kendo DataSource extension so you can load data into your [Kendo UI Grid](http://docs.telerik.com/kendo-ui/api/javascript/ui/grid) from an [ElasticSearch](https://www.elasticsearch.org/) index.

It supports filtering, searching, sorting, grouping and aggregating in ElasticSearch for date, number and string fields.

## Demos

To run the demos on your computer you will need a local instance of ElasticSearch, a clone of this repository and [nodejs](https://nodejs.org) and [bower](http://bower.io/).

The dataset is constituted of 2 simple mappings: "organization" and "person". The documents are generated randomly using [json-schema-faker](https://github.com/json-schema-faker/json-schema-faker).
The persons have an organization as [parent](https://www.elastic.co/guide/en/elasticsearch/guide/current/parent-child.html).
Each textual field is indexed using the standard analyzer and has additional subfields more suitable for regexp filtering and aggregations on exact values.
Have a look at the [index definition](./demos/index-definition.json) to see how this is done.

Clone the project and create the datasets:

    git clone https://github.com/MGDIS/kendo-elasticsearch.git
    cd kendo-elasticsearch
    npm install
    node demos/create-datasets.js

Afterwards you just have to open the HTML files in your browser.

### Basic

This example queries the "person" mapping. It has paging, sorting and filtering.
Filtering of text fields is based on a "lowercase" subfield, except for "contains" which behaves as a classical keywords search.

See [the source code](./demos/basic.html).

### Aggregate

This example illustrates using server side aggregations to work on a number field and the cardinality of a text field.
Aggregations are dependent on the filters, but not on the pagination.

See [the source code](./demos/aggregate.html).
