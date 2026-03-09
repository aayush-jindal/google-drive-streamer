import { useState, useCallback, useEffect } from 'react';

/**
 * Manages focused index within a flat grid for TV remote navigation.
 *
 * @param {number} itemCount - total number of focusable items
 * @param {number} columns   - number of columns in the grid
 */
export function useFocusNav(itemCount, columns) {
  const [focusIndex, setFocusIndex] = useState(0);

  // Reset to 0 whenever the item list changes (new folder opened)
  useEffect(() => {
    setFocusIndex(0);
  }, [itemCount]);

  /**
   * Move focus in response to an arrow key.
   * @param {'ArrowLeft'|'ArrowRight'|'ArrowUp'|'ArrowDown'} key
   */
  const moveFocus = useCallback(
    (key) => {
      if (itemCount === 0) return;
      setFocusIndex((prev) => {
        const col = prev % columns;
        const row = Math.floor(prev / columns);

        switch (key) {
          case 'ArrowRight':
            return col < columns - 1 && prev + 1 < itemCount ? prev + 1 : prev;

          case 'ArrowLeft':
            return col > 0 ? prev - 1 : prev;

          case 'ArrowDown': {
            const next = prev + columns;
            return next < itemCount ? next : prev;
          }

          case 'ArrowUp':
            return row > 0 ? prev - columns : prev;

          default:
            return prev;
        }
      });
    },
    [itemCount, columns],
  );

  return { focusIndex, setFocusIndex, moveFocus };
}
