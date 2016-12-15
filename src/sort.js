export const kendo2es = _kendo2es;
export const prepareParams = _prepareParams;

// Transform sort instruction into some object suitable for Elasticsearch
// Also deal with sorting the different nesting levels
function _kendo2es(sort, fields, nestedPath) {
  return sort.filter(sortItem => {
    const field = fields[sortItem.field];
    if (!field) return false;
    return field.esNestedPath === nestedPath ||
      field.esParentType === nestedPath ||
      field.esChildType === nestedPath;
  }).map(sortItem => {
    return {
      [fields[sortItem.field].esFilterName]: {
        order: sortItem.dir,
        // Always put items without the sorted key at the end
        missing: '_last',
        // Deal with sorting items by a property in nested documents
        mode: sortItem.dir === 'asc' ? 'min' : 'max'
      }
    };
  });
};

// Prepare sort parameters for easier transformation to ES later on
function _prepareParams(sort, groups = []) {
  // first fix the type of the param that can be object of group
  // we always parse as an array
  // http://docs.telerik.com/kendo-ui/api/javascript/data/datasource#configuration-sort
  let sortArray = [];
  if (sort && sort.constructor === Array) {
    sortArray = sort;
  } else {
    if (sort) {
      sortArray.push(sort);
    }
  }

  // Sort instructions for the groups are first
  let fullSort = [];
  groups.forEach(group => {
    const matchingSort = sortArray.filter(function (sortItem) {
      return sortItem.field === group.field;
    });
    if (matchingSort.length) {
      fullSort.push(matchingSort[0]);
      sortArray.splice(sortArray.indexOf(matchingSort[0]), 1);
    } else {
      // Sort by default
      fullSort.push({
        field: group.field,
        dir: group.dir || 'asc'
      });
    }
  });

  // Then original sort instructions are added
  fullSort = fullSort.concat(sortArray);

  return fullSort;
}
