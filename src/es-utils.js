// Some function that work on ES queries to deal with nested levels and other
// difficulties

export const innerHits = _innerHits;
export const innerHitsFilter = _innerHitsFilter;

// Get a root inner_hits definition to fetch all nested/parent/child docs
function _innerHits(nestedFields, esMappingKey, subTypes, sort, filter) {
  const innerHits = {};
  Object.keys(nestedFields).forEach(nestedPath => {
    let previousLevelInnerHits = innerHits;
    const previousPathParts = [];
    nestedPath.split('.').forEach(nestedPathPart => {
      previousPathParts.push(nestedPathPart);
      const currentPath = previousPathParts.join('.');
      const fullCurrentPath = esMappingKey ? esMappingKey + '.' + currentPath : currentPath;
      const currentFields = nestedFields[currentPath];
      if (!currentFields) {
        return;
      }
      if (!previousLevelInnerHits[currentPath]) {
        previousLevelInnerHits[currentPath] = {
          path: {
            [fullCurrentPath]: {
              _source: currentFields,
              size: 10000,
              sort: sort,
              query: {
                filtered: {
                  filter: _innerHitsFilter(fullCurrentPath, null, filter)
                }
              }
            }
          }
        };
      }
      if (currentPath !== nestedPath) {
        previousLevelInnerHits[currentPath].path[fullCurrentPath].inner_hits =
          previousLevelInnerHits[currentPath].path[fullCurrentPath].inner_hits || {};
        previousLevelInnerHits =
          previousLevelInnerHits[currentPath].path[fullCurrentPath].inner_hits;
      }
    });
  });

  Object.keys(subTypes).forEach(subType => {
    const currentFields = subTypes[subType];
    innerHits[subType] = {
      type: {
        [subType]: {
          _source: currentFields,
          size: 10000,
          sort: sort,
          query: {
            filtered: {
              filter: _innerHitsFilter(null, subType, filter)
            }
          }
        }
      }
    };
  });
  return innerHits;
}

function _manageBooleanFilter(nestedPath, subType, booleanFilter) {
  return booleanFilter
    .filter(childFilter => {
      return (childFilter.bool && childFilter.bool.must) || (childFilter.bool && childFilter.bool.should) ||
        (childFilter.nested && childFilter.nested.path === nestedPath) ||
        (childFilter.not && childFilter.not.nested && childFilter.not.nested.path === nestedPath) ||
        (childFilter.has_child && childFilter.has_child.type === subType) ||
        (childFilter.not && childFilter.not.has_child && childFilter.not.has_child.type === subType) ||
        (childFilter.has_parent && childFilter.has_parent.type === subType) ||
        (childFilter.not && childFilter.not.has_parent && childFilter.not.has_parent.type === subType);
    })
    .map(childFilter => {
      if (childFilter.nested) {
        return childFilter.nested.filter;
      } else if (childFilter.not && childFilter.not.nested) {
        return {
          not: childFilter.not.nested.filter
        };
      } else if (childFilter.has_child) {
        return childFilter.has_child.filter;
      } else if (childFilter.not && childFilter.not.has_child) {
        return {
          not: childFilter.not.has_child.filter
        };
      } else if (childFilter.has_parent) {
        return childFilter.has_parent.filter;
      } else if (childFilter.not && childFilter.not.has_parent) {
        return {
          not: childFilter.not.has_parent.filter
        };
      } else {
        return _innerHitsFilter(nestedPath, childFilter);
      }
    });
}

// Traverse the filter to keep only the parts that concern
// a nesting path
function _innerHitsFilter(nestedPath, subType, filter) {
  filter = $.extend(true, {}, filter);
  if (filter.bool && filter.bool.must) {
    filter.bool.must = _manageBooleanFilter(nestedPath, subType, filter.bool.must);
  }

  if (filter.bool && filter.bool.should) {
    filter.bool.should = _manageBooleanFilter(nestedPath, subType, filter.bool.should);
  }

  return filter;
}
