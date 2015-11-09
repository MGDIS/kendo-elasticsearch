/* jshint qunit: true */

// A karma/qunit test suite
// Based on the test suites from kendo-ui
// For example: https://github.com/telerik/kendo-ui-core/blob/master/tests/data/datasource/read.js

(function() {

  var ElasticSearchDataSource = kendo.data.ElasticSearchDataSource;

  var baseOpts = {
    transport: {
      read: {
        url: "http://localhost:9200/_search"
      }
    },
    pageSize: 10,

    schema: {
      model: {
        fields: {
          companyName: {
            type: "string"
          }
        }
      }
    }
  };

  module("kendo-elasticsearch", {
    setup: function() {
      $.mockjaxSettings.responseTime = 0;
    },
    teardown: function() {
      $.mockjax.clear();
    }
  });

  test("fails if missing parameters", function() {
    throws(function() {
      new ElasticSearchDataSource();
    }, /Options/);

    throws(function() {
      new ElasticSearchDataSource({});
    }, /transport/);

    throws(function() {
      new ElasticSearchDataSource({
        transport: {
          read: {
            url: "http://localhost:9200/_search"
          }
        }
      });
    }, /model/);
  });

  test("reads data through transport and parse result", function(assert) {
    var done = assert.async();

    var opts = $.extend(true, {}, baseOpts);
    opts.pageSize = 2;
    var dataSource = new ElasticSearchDataSource(opts);

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      responseText: {
        "hits": {
          "total": 11002,
          "max_score": 1.0,
          "hits": [{
            "_source": {
              "companyName": ["MGDIS"]
            }
          }, {
            "_source": {
              "companyName": ["Telerik"]
            }
          }]
        }
      }
    });

    dataSource.fetch(function() {
      var view = dataSource.view();
      equal(view[0].companyName, "MGDIS");
      equal(view[1].companyName, "Telerik");
      done();
    });
  });

  test("paginates", function(assert) {
    var done = assert.async();

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      response: function(options) {
        var data = JSON.parse(options.data);
        equal(data.from, 10);
        equal(data.size, 10);
        done();
      }
    });

    var opts = $.extend(true, {}, baseOpts);
    opts.page = 2;
    var dataSource = new ElasticSearchDataSource(opts);
    dataSource.fetch();
  });

  test("filters using startswith operator", function(assert) {
    var done = assert.async();

    var opts = $.extend(true, {}, baseOpts);
    opts.filter = {
      field: "companyName",
      operator: "startswith",
      value: "mgdis"
    };
    var dataSource = new ElasticSearchDataSource(opts);

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      response: function(options) {
        var data = JSON.parse(options.data);
        equal(data.query.filtered.filter.and.filters.length, 1);
        equal(data.query.filtered.filter.and.filters[0].query.query_string.query,
          "companyName:mgdis*");
        done();
      }
    });

    dataSource.fetch();
  });

  test("filters using startswith operator on a default subfield", function(assert) {
    var done = assert.async();

    var opts = $.extend(true, {}, baseOpts);
    opts.schema.model.esStringSubFields = {
      filter: "lowercase"
    };
    opts.filter = {
      field: "companyName",
      operator: "startswith",
      value: "mgdis"
    };
    var dataSource = new ElasticSearchDataSource(opts);

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      response: function(options) {
        var data = JSON.parse(options.data);
        equal(data.query.filtered.filter.and.filters.length, 1);
        equal(data.query.filtered.filter.and.filters[0].query.query_string.query,
          "companyName.lowercase:mgdis*");
        done();
      }
    });

    dataSource.fetch();
  });

  test("filters using startswith operator on a subfield", function(assert) {
    var done = assert.async();

    var opts = $.extend(true, {}, baseOpts);
    opts.schema.model.fields.companyName.esFilterSubField = "lowercase";
    opts.filter = {
      field: "companyName",
      operator: "startswith",
      value: "mgdis"
    };
    var dataSource = new ElasticSearchDataSource(opts);

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      response: function(options) {
        var data = JSON.parse(options.data);
        equal(data.query.filtered.filter.and.filters.length, 1);
        equal(data.query.filtered.filter.and.filters[0].query.query_string.query,
          "companyName.lowercase:mgdis*");
        done();
      }
    });

    dataSource.fetch();
  });

  test("sorts", function(assert) {
    var done = assert.async();

    var opts = $.extend(true, {}, baseOpts);
    opts.sort = [{
      field: "companyName",
      dir: "asc"
    }];
    var dataSource = new ElasticSearchDataSource(opts);

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      response: function(options) {
        var data = JSON.parse(options.data);
        equal(data.sort.length, 1);
        equal(data.sort[0].companyName.order, "asc");
        done();
      }
    });

    dataSource.fetch();
  });

  test("groups by a field", function(assert) {
    var done = assert.async();

    var opts = $.extend(true, {}, baseOpts);
    opts.schema.model.fields.companyName.esAggSubField = "raw";
    opts.pageSize = 2;
    opts.group = [{
      field: "companyName"
    }];
    var dataSource = new ElasticSearchDataSource(opts);

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      response: function(options) {
        var data = JSON.parse(options.data);
        ok(data.aggs.hasOwnProperty("companyName_group"));
        ok(data.aggs.hasOwnProperty("companyName_missing"));
        this.responseText = {
          "hits": {
            "hits": [{
              "_source": {
                "companyName": "MGDIS"
              }
            }, {
              "_source": {
                "companyName": "Telerik"
              }
            }]
          },
          "aggregations": {
            "companyName_group": {
              "buckets": [{
                "key": "MGDIS",
                "doc_count": 1
              }, {
                "key": "Telerik",
                "doc_count": 1
              }]
            },
            "companyName_missing": {
              "doc_count": 3
            }
          }
        };
      }
    });

    dataSource.fetch(function() {

      //var view = dataSource.view();
      done();
    });
  });

  test("groups by a date histogram", function(assert) {
    var done = assert.async();

    var opts = $.extend(true, {}, baseOpts);
    opts.schema.model.fields.companyName.esAggSubField = "raw";
    opts.pageSize = 2;
    opts.schema = {
      model: {
        fields: {
          firstName: {
            type: "string",
            esFilterSubField: "lowercase",
            esName: "name.firstName"
          },
          lastName: {
            type: "string",
            esFilterSubField: "lowercase",
            esName: "name.lastName"
          },
          birthDate: {
            type: "date"
          }
        }
      }
    };
    opts.group = {
      field: "birthDate",
      dir: "desc",
      aggregates: [{
        field: "birthDate",
        aggregate: "date_histogram",
        interval: "year"
      }]
    };

    var dataSource = new ElasticSearchDataSource(opts);

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      response: function(options) {
        var data = JSON.parse(options.data);
        ok(data.aggs.hasOwnProperty("birthDate_group"));
        ok(data.aggs.birthDate_group.hasOwnProperty("date_histogram"));
        ok(data.aggs.hasOwnProperty("birthDate_missing"));
        this.responseText = {
          "hits": {
            "hits": [{
              "_source": {
                "birthDate": "1983-11-28T00:00:00.000Z",
                "name": {
                  "lastName": "Mouton",
                  "firstName": "Alban"
                }
              }
            }, {
              "_source": {
                "birthDate": ["1980-10-23T00:11:24.847Z"],
                "name": {
                  "lastName": "Cabillic",
                  "firstName": "Hélène"
                }
              }
            }]
          },
          "aggregations": {
            "birthDate_missing": {
              "doc_count": 0
            },
            "birthDate_group": {
              "buckets": [{
                "key_as_string": "1980-01-01T00:00:00.000Z",
                "doc_count": 1
              }, {
                "key_as_string": "1981-01-01T00:00:00.000Z",
                "doc_count": 0
              }, {
                "key_as_string": "1982-01-01T00:00:00.000Z",
                "doc_count": 0
              }, {
                "key_as_string": "1983-01-01T00:00:00.000Z",
                "doc_count": 1
              }]
            }
          }
        };
      }
    });

    dataSource.fetch(function() {
      var view = dataSource.view();
      ok(view[0].hasOwnProperty("items"));
      done();
    });
  });

  test("aggregates on a number and text fields", function(assert) {
    var done = assert.async();

    var opts = $.extend(true, {}, baseOpts);
    opts.schema.model.fields.companyName.esAggSubField = "raw";
    opts.pageSize = 2;
    opts.schema = {
      model: {
        fields: {
          firstName: {
            type: "string",
            esFilterSubField: "lowercase",
            esName: "name.firstName"
          },
          lastName: {
            type: "string",
            esFilterSubField: "lowercase",
            esName: "name.lastName"
          },
          siblings: {
            type: "number"
          }
        }
      }
    };
    opts.aggregate = [{
      field: "lastName",
      aggregate: "count"
    }, {
      field: "siblings",
      aggregate: "min"
    }, {
      field: "siblings",
      aggregate: "max"
    }, {
      field: "siblings",
      aggregate: "sum"
    }, {
      field: "siblings",
      aggregate: "average"
    }];

    var dataSource = new ElasticSearchDataSource(opts);

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      response: function(options) {
        var data = JSON.parse(options.data);
        ok(data.aggs.hasOwnProperty("lastName_count"));
        ok(data.aggs.hasOwnProperty("siblings_max"));
        this.responseText = {
          "hits": {
            "hits": [{
              "_source": {
                "siblings": 2,
                "name": {
                  "lastName": "Rath",
                  "firstName": "Audrey"
                }
              }
            }, {
              "fields": {
                "siblings": 3,
                "name": {
                  "lastName": "Williamson",
                  "firstName": "Andreanne"
                }
              }
            }]
          },
          "aggregations": {
            "lastName_count": {
              "value": 471
            },
            "siblings_min": {
              "value": 0.0
            },
            "siblings_max": {
              "value": 10.0
            },
            "siblings_average": {
              "value": 4.7479
            },
            "siblings_sum": {
              "value": 47479.0
            }
          }
        };
      }
    });

    dataSource.fetch(function() {
      var agg = dataSource.aggregates();
      equal(agg.lastName.count, 471);
      equal(agg.siblings.max, 10);
      done();
    });
  });

  test("supports nested objects of multiple levels", function(assert) {
    var done = assert.async();

    var opts = $.extend(true, {}, baseOpts);
    opts.pageSize = 2;
    opts.schema = {
      model: {
        fields: {
          companyName: {
            type: "string"
          },
          addressCountry: {
            type: "string",
            esNestedPath: "addresses",
            esName: "country"
          },
          telephoneValue: {
            type: "string",
            esNestedPath: "addresses.telephones",
            esName: "value"
          }
        }
      }
    };
    opts.filter = {
      field: "addressCountry",
      operator: "eq",
      value: "Bulgaria"
    };
    var dataSource = new ElasticSearchDataSource(opts);

    $.mockjax({
      url: "http://localhost:9200/_search",
      type: "POST",
      response: function(options) {
        var data = JSON.parse(options.data);

        equal(data.query.filtered.filter.and.filters[0].nested.path, "addresses");
        ok(data.inner_hits.hasOwnProperty("addresses"));
        ok(data.inner_hits.addresses.path.addresses.inner_hits
          .hasOwnProperty("addresses.telephones"));
        equal(data.inner_hits.addresses.path.addresses.inner_hits["addresses.telephones"]
          .path["addresses.telephones"].query.filtered.filter.and.filters.length, 0);
        this.responseText = {
          "hits": {
            "hits": [{
              "_source": {
                "companyName": "Telerik"
              },
              "inner_hits": {
                "addresses": {
                  "hits": {
                    "hits": [{
                      "_source": {
                        "country": "Bulgaria"
                      },
                      "inner_hits": {
                        "addresses.telephones": {
                          "hits": {
                            "hits": [{
                              "_source": {
                                "value": "860.138.6580"
                              }
                            }, {
                              "_source": {
                                "value": "(979) 154-0643 x246"
                              }
                            }]
                          }
                        }
                      }
                    }, {
                      "fields": {
                        "country": ["USA"]
                      },
                      "inner_hits": {
                        "addresses.telephones": {
                          "hits": {
                            "hits": [{
                              "_source": {
                                "value": "(516) 982-7971"
                              }
                            }]
                          }
                        }
                      }
                    }]
                  }
                }
              }
            }, {
              "fields": {
                "companyName": ["MGDIS"]
              },
              "inner_hits": {
                "addresses": {
                  "hits": {
                    "hits": [{
                      "fields": {
                        "country": ["France"]
                      },
                      "inner_hits": {
                        "addresses.telephones": {
                          "hits": {
                            "hits": [{
                              "_source": {
                                "value": "027-143-6935"
                              }
                            }]
                          }
                        }
                      }
                    }]
                  }
                }
              }
            }]
          }
        };
      }
    });

    dataSource.fetch(function() {
      var view = dataSource.view();
      equal(view.length, 4);
      equal(view[0].companyName, "Telerik");
      equal(view[0].addressCountry, "Bulgaria");
      equal(view[0].telephoneValue, "860.138.6580");
      done();
    });
  });

    test("supports fetching parent fields", function(assert) {
      var done = assert.async();

      var opts = $.extend(true, {}, baseOpts);
      opts.pageSize = 2;
      opts.schema = {
        model: {
          fields: {
            firstName: {
              type: "string",
              esName: "name.firstName"
            },
            lastName: {
              type: "string",
              esName: "name.lastName"
            },
            companyName: {
              type: "string",
              esParentType: "organization",
              esName: "companyName"
            }
          }
        }
      };
      opts.filter = {
        field: "companyName",
        operator: "neq",
        value: "Telerik"
      };
      var dataSource = new ElasticSearchDataSource(opts);

      $.mockjax({
        url: "http://localhost:9200/_search",
        type: "POST",
        response: function(options) {
          var data = JSON.parse(options.data);
          equal(data.query.filtered.filter.and.filters[0].has_parent.type, "organization");
          this.responseText = {
            "hits": {
              "hits": [{
                "_source": {
                  "name": {
                    "lastName": ["Rath"],
                    "firstName": ["Audrey"]
                  }
                },
                "inner_hits": {
                  "organization": {
                    "hits": {
                      "hits": [{
                        "_source": {
                          "companyName": ["MGDIS"]
                        }
                      }]
                    }
                  }
                }
              }, {
                "_source": {
                  "name": {
                    "lastName": ["Williamson"],
                    "firstName": ["Andreanne"]
                  }
                },
                "inner_hits": {
                  "organization": {
                    "hits": {
                      "hits": [{
                        "_source": {
                          "companyName": ["MGDIS"]
                        }
                      }]
                    }
                  }
                }
              }]
            }
          };
        }
      });

      dataSource.fetch(function() {
        var view = dataSource.view();
        equal(view[0].companyName, "MGDIS");
        done();
      });
    });

    test("supports fetching children fields", function(assert) {
      var done = assert.async();

      var opts = $.extend(true, {}, baseOpts);
      opts.pageSize = 2;
      opts.schema = {
        model: {
          fields: {
            companyName: {
              type: "string"
            },
            firstName: {
              type: "string",
              esChildType: "person",
              esName: "name.firstName"
            }
          }
        }
      };
      opts.filter = {
        field: "firstName",
        operator: "contains",
        value: "Alban"
      };
      var dataSource = new ElasticSearchDataSource(opts);

      $.mockjax({
        url: "http://localhost:9200/_search",
        type: "POST",
        response: function(options) {
          var data = JSON.parse(options.data);
          equal(data.query.filtered.filter.and.filters[0].has_child.type, "person");
          this.responseText = {
            "hits": {
              "hits": [{
                "_source": {
                  "companyName": "MGDIS"
                },
                "inner_hits": {
                  "person": {
                    "hits": {
                      "hits": [{
                        "_source": {
                          "name": {
                            "firstName": "Alban"
                          }
                        }
                      }]
                    }
                  }
                }
              }]
            }
          };
        }
      });

      dataSource.fetch(function() {
        var view = dataSource.view();
        equal(view[0].companyName, "MGDIS");
        equal(view[0].firstName, "Alban");
        done();
      });
    });

    test("supports parsing ES mapping", function(assert) {
      var done = assert.async();

      var opts = $.extend(true, {}, baseOpts);
      opts.pageSize = 2;
      opts.schema = {
        model: {
          esMapping: {
            properties: {

              // Add a '-' in this key to test key transformation
              "company-name": {
                type: "string"
              },
              addresses: {
                type: "nested",
                properties: {
                  country: {
                    type: "string"
                  },
                  telephones: {
                    type: "nested",
                    properties: {
                      value: "string"
                    }
                  }
                }
              }
            }
          }
        }
      };
      opts.filter = {
        field: "addresses_country",
        operator: "eq",
        value: "Bulgaria"
      };
      var dataSource = new ElasticSearchDataSource(opts);

      $.mockjax({
        url: "http://localhost:9200/_search",
        type: "POST",
        response: function(options) {
          var data = JSON.parse(options.data);
          equal(data.query.filtered.filter.and.filters[0].nested.path, "addresses");
          ok(data.inner_hits.hasOwnProperty("addresses"));
          this.responseText = {
            "hits": {
              "hits": [{
                "_source": {
                  "company-name": ["Telerik"]
                },
                "inner_hits": {
                  "addresses": {
                    "hits": {
                      "hits": [{
                        "_source": {
                          "country": ["Bulgaria"]
                        },
                        "inner_hits": {
                          "addresses.telephones": {
                            "hits": {
                              "hits": [{
                                "_source": {
                                  "value": ["860.138.6580"]
                                }
                              }, {
                                "_source": {
                                  "value": ["(979) 154-0643 x246"]
                                }
                              }]
                            }
                          }
                        }
                      }, {
                        "_source": {
                          "country": ["USA"]
                        },
                        "inner_hits": {
                          "addresses.telephones": {
                            "hits": {
                              "hits": [{
                                "_source": {
                                  "value": ["(516) 982-7971"]
                                }
                              }]
                            }
                          }
                        }
                      }]
                    }
                  }
                }
              }, {
                "fields": {
                  "company-name": ["MGDIS"]
                },
                "inner_hits": {
                  "addresses": {
                    "hits": {
                      "hits": [{
                        "_source": {
                          "country": ["France"]
                        },
                        "inner_hits": {
                          "addresses.telephones": {
                            "hits": {
                              "hits": [{
                                "_source": {
                                  "value": ["027-143-6935"]
                                }
                              }]
                            }
                          }
                        }
                      }]
                    }
                  }
                }
              }]
            }
          };
        }
      });

      dataSource.fetch(function() {
        var view = dataSource.view();
        equal(view.length, 4);
        equal(view[0].company_name, "Telerik");
        equal(view[0].addresses_country, "Bulgaria");
        equal(view[0].addresses_telephones_value, "860.138.6580");
        done();
      });
    });

}());
