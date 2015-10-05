# kendo-elasticsearch

[![Build Status](https://travis-ci.org/MGDIS/kendo-elasticsearch.svg)](https://travis-ci.org/MGDIS/kendo-elasticsearch)

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

Afterwards you just have to open the HTML files from the demos folder in your browser.

### Basic

This example queries the "person" mapping. It has paging, sorting and filtering.
Filtering of text fields is based on a "lowercase" subfield, except for "contains" which behaves as a classical keywords search.

See [the source code](./demos/basic.html).

### Aggregate

This example illustrates using server side aggregations to work on a number field and the cardinality of a text field.
Aggregations are dependent on the filters, but not on the pagination.

See [the source code](./demos/aggregate.html).

### Groups and group aggregations

This example illustrates using server side bucket aggregations to group lines based on the values of a field.
It also uses metric aggregations on the buckets.

Please note that it is better to use this functionality on fields with a moderate cardinality.
This is because all buckets will be requested, not only the ones needed to display the current page.

See [the source code](./demos/groups.html).

### Joined multi values

This example illustrates using a custom separator to join the multiple values of a field inside a single cell.

The separator can use HTML if the 'encoded' attribute of the column is set to 'false'.

See [the source code](./demos/multivalues-join.html).

### Split multi values

This example illustrates splitting the lines of data based on the multiple values of a field.

Please note that the page size and filters can seem to be badly interpreted. This is because the actual lines of data fetched from the server and the lines
displayed to the user are 2 separate things.

This is probably not a very useful feature for user interactions and visualization, but it can be handy for exporting the dataset.

See [the source code](./demos/multivalues-split.html).

### Dates

This example illustrates working with date fields and grouping items based on a server-side date histogram.

See [the source code](./demos/dates.html).

### Nested

This example illustrates displaying information from an array of nested objects, in this case addresses in the organization mapping.
The lines of data are duplicated much like in the "Split multi values" demo, so the page size is not visually respected.
But the [inner hits](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-inner-hits.html) functionality
of ElasticSearch is used so that filtering works well.

See [the source code](./demos/nested.html).

### Parent

This example illustrates displaying information from a parent document.

Please note that on ElasticSearch pre 2.0 the inner hits functionality has a bug that prevents us from using a search URL that includes the type.
See the [related issue](https://github.com/elastic/elasticsearch/issues/13898).

Also sorting on the parent [is not possible yet](https://github.com/elastic/elasticsearch/issues/2917), [nor aggregating](https://www.elastic.co/guide/en/elasticsearch/guide/current/children-agg.html).

See [the source code](./demos/parent.html).

### Children

This example illustrates displaying information from a children documents.

Please note that on ElasticSearch pre 2.0 the inner hits functionality has a bug that prevents us from using a search URL that includes the type.
See the [related issue](https://github.com/elastic/elasticsearch/issues/13898).

Also sorting on the child [is not possible yet](https://github.com/elastic/elasticsearch/issues/2917).

See [the source code](./demos/children.html).

## TODO:

  - Support empty values in sorting (always last ?)
  - Add a note about kendo grid licence, web and pro packs.
  - Add a note about ElasticSearch versions compatibility.
  - Add notes about kendo/ES functionalities mapping and the relational behind it
  - Is it possible to add another filter operator ? It would be nice for 'contains' and 'doesnotcontain' to be pattern based and to have a 'search' operator.
  - Combine with some external filter or query
  - Split a date field in its parts (day, month, year)
  - how to best use nested objects ? Use [detail template](http://demos.telerik.com/kendo-ui/grid/detailtemplate) ? A single formatted cell ? Split lines ?
  - how to best use children/parent relationships ? Use [hierarchy](http://demos.telerik.com/kendo-ui/grid/hierarchy) ?
  - Move these todos into actual issues :)
