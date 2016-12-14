export const fillInGroups = _fillInGroups;
export const fromHits = _fromHits;

// distribute data items in groups based on a field value
function _fillInGroups(groupDefs, dataItems, field) {
  const groups = [];
  dataItems.forEach(function (dataItem) {
    let group = groupDefs.map[dataItem[field.key] || ''];

    // If no exact match, then we may be in some range aggregation ?
    if (!group) {
      const fieldValue = field.type === 'date' ? new Date(dataItem[field.key]) : dataItem[field.key];

      for (let i = 0; i < groupDefs.keys.length; i++) {
        const groupDefValue = field.type === 'date' ? new Date(groupDefs.keys[i]) : groupDefs.keys[i];
        if (fieldValue >= groupDefValue) {
          const groupDefNextValue = groupDefs.keys[i + 1] && (field.type === 'date' ?
            new Date(groupDefs.keys[i + 1]) : groupDefs.keys[i + 1]);
          if (!groupDefNextValue || fieldValue < groupDefNextValue) {
            group = groupDefs.map[groupDefs.keys[i]];
          }
        }
      }
    }

    if (!group) {
      throw new Error('No group found, val: ' + dataItem[field.key] + ' field: ' + field.key);
    }
    group.items.push(dataItem);
    if (group.items.length === 1) {
      groups.push(group);
    }
  });
  return groups;
}

// Mimic fetching values from _source as the 'fields' functionality
// would have done it.
// We do not use the native 'fields' due to this bug:
// https://github.com/elastic/elasticsearch/issues/14475
function _getValuesFromSource(source, pathParts) {
  let values = [];
  const value = source[pathParts[0]];
  if (value === undefined) {
    return [];
  }

  if (pathParts.length > 1) {

    // recursivity is not over, there remain some path parts
    if ($.isArray(value)) {
      value.forEach(function (valueItem) {
        values = values.concat(_getValuesFromSource(valueItem, pathParts.slice(1)));
      });
    } else {
      values = _getValuesFromSource(value, pathParts.slice(1));
    }
  } else {

    // recursivity, we should be in a leaf value
    if ($.isArray(value)) {
      values = value;
    } else {
      values = [value];
    }
  }
  return values;
}

// Transform hits from the ES query in to data items for kendo grid
// The difficulty is that hits can contain inner hits and that some
// fields can be multi-valued
function _fromHits(hits, fields, innerPath) {

  let dataItems = [];
  hits.forEach(hit => {
    const hitSource = hit._source || {};
    const dataItem = {};

    dataItem.id = [hit._id];
    Object.keys(fields).filter(fieldKey => {
      const field = fields[fieldKey];

      // Keep only the fields that are part of this nested/parent/child
      if (innerPath === undefined) {
        return !(field.esNestedPath || field.esChildType || field.esParentType);
      } else {
        return field.esNestedPath === innerPath ||
          field.esChildType === innerPath ||
          field.esParentType === innerPath;
      }
    }).forEach(function (fieldKey) {
      const field = fields[fieldKey];
      let values = _getValuesFromSource(hitSource, field.esNameSplit);

      // special case field that is a date deep down by displayed as a number
      if (field.duration) {
        if (!moment) {
          throw new Error('Working on durations requires to load momentjs library');
        }
      }

      if (field.duration === 'beforeToday') {
        values = values.map(value => {
          return moment().startOf('day').diff(moment(value).startOf('day'), 'days');
        });
      }

      if (field.duration === 'afterToday') {
        values = values.map(value => {
          return moment(value).startOf('day').diff(moment().startOf('day'), 'days');
        });
      }

      if (values) {
        if (field.esMultiSplit) {
          if (values && values.length) {
            dataItem[fieldKey] = values;
          } else {
            dataItem[fieldKey] = [null];
          }
        } else {
          dataItem[fieldKey] = values.join(field.esMultiSeparator || '\n');
        }
      }
    });

    // Multiply and fill items based on nesting levels
    let splittedItems = [dataItem];
    Object.keys(hit.inner_hits || {}).forEach(function (innerHitKey) {
      const nestedItems =
        _fromHits(hit.inner_hits[innerHitKey].hits.hits, fields, innerHitKey);
      const newSplittedDataItems = [];
      splittedItems.forEach(function (splittedItem) {
        if (nestedItems.length) {
          nestedItems.forEach(function (nestedItem) {
            const mergedItem = {};
            Object.keys(nestedItem).forEach(function (key) {
              mergedItem[key] = nestedItem[key];
            });
            Object.keys(splittedItem).forEach(function (key) {
              mergedItem[key] = splittedItem[key];
            });
            newSplittedDataItems.push(mergedItem);
          });
        } else {
          newSplittedDataItems.push(splittedItem);
        }
      });
      splittedItems = newSplittedDataItems;
    });

    dataItems = dataItems.concat(splittedItems);

  });
  return _splitMultiValues(dataItems);
}

// Split lines of data items based on their optionally multipl items
// Example: [{a:[1,2],b:[3]}] -> [{a:1,b:3},{a:2,b:3}]
function _splitMultiValues(items) {
  let results = [];

  // Iterates on items in the array and multiply based on multiple values
  items.forEach(item => {
    let itemResults = [{}];

    // Iterate on properties of item
    Object.keys(item).forEach(k => {
      const partialItemResults = [];

      // Iterate on the multiple values of this property
      if (item[k] && item[k].constructor === Array) {
        item[k].forEach(val => {
          itemResults.forEach(result => {

            // Clone the result to create variants with the different values of current key
            const newResult = {};
            Object.keys(result).forEach(k2 => newResult[k2] = result[k2]);
            newResult[k] = val;
            partialItemResults.push(newResult);
          });
        });
      } else {
        itemResults.forEach(result => {
          result[k] = item[k];
          partialItemResults.push(result);
        });
      }
      itemResults = partialItemResults;
    });

    results = results.concat(itemResults);
  });
  return results;
}
