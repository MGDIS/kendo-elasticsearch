/* jshint qunit: true */

// A karma/qunit test suite
// Based on the test suites from kendo-ui
// For example: https://github.com/telerik/kendo-ui-core/blob/master/tests/data/datasource/read.js

(function() {

  var schema = {
    id: function(record) {
      return record.id;
    },
    data: function(data) {
      return data;
    }
  };

  var DataSource = window.kendo.data.DataSource;

  module("kendo-elasticsearch", {
    setup: function() {
      $.mockjaxSettings.responseTime = 0;
    },
    teardown: function() {
      $.mockjax.clear();
    }
  });

  test("reads data through transport", function() {
    var readWasCalled = false,
      dataSource = new DataSource({
        schema: schema,
        transport: {
          read: function() {
            readWasCalled = true;
          }
        }
      });

    dataSource.read();
    ok(readWasCalled);
  });

}());
