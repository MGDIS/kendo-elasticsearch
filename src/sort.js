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
        missing: '_last',
        mode: sortItem.dir === 'asc' ? 'min' : 'max'
      }
    };
  });
};

// Prepare sort parameters for easier transformation to ES later on
function _prepareParams(sort, groups) {
  // first fix the type of the param that can be object of group
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
  (groups || []).forEach(function (group) {
    const matchingSort = sortArray.filter(function (sortItem) {
      return sortItem.field === group.field;
    });
    if (matchingSort.length) {
      fullSort.push(matchingSort[0]);
      sortArray.splice(sortArray.indexOf(matchingSort[0]), 1);
    } else {
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
