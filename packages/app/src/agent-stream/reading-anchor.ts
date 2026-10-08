interface RowGeometry {
  id: string;
  top: number;
  height: number;
}

// A row must clear the reading line before the next row takes ownership.
const READING_POSITION_OFFSET_PX = 8;

// Content coordinates survive user scrolling. Layout commits replace the geometry;
// scroll events reuse it, without another DOM measurement pass.
export function createReadingAnchor() {
  // `entered` marks a row the reading line crossed into during the current frame:
  // the reader was still looking at content outside of it when the last frame
  // painted. `settle` ends the frame.
  let anchor: { id: string; top: number; height: number; entered: boolean } | null = null;
  let geometry: readonly RowGeometry[] = [];
  const readingRow = (scrollTop: number) =>
    geometry.find((row) => row.top + row.height > scrollTop + READING_POSITION_OFFSET_PX);
  // The row being read keeps its top in place when it grows. A row the line has
  // just entered also holds the content the reader was looking at when it shrinks
  // (an image replacing its placeholder): that content sits past the row, so
  // keeping the row's top would slide it up under the reader. The correction is
  // capped by how deep the line is in the row, which keeps a row entered at its
  // top where it is.
  const project = (
    scrollTop: number,
    row: (Pick<RowGeometry, "id" | "top"> & { height?: number }) | undefined,
  ) => {
    if (!anchor || row?.id !== anchor.id) return scrollTop;
    const shrink = row.height === undefined ? 0 : Math.max(0, anchor.height - row.height);
    const depth = Math.max(0, scrollTop + READING_POSITION_OFFSET_PX - anchor.top);
    const follow = anchor.entered ? Math.min(shrink, depth) : 0;
    return scrollTop + row.top - anchor.top - follow;
  };
  return {
    getRowId: () => anchor?.id ?? null,
    getReadingRowId: (scrollTop: number) =>
      readingRow(scrollTop)?.id ?? geometry.at(-1)?.id ?? null,
    project,
    reset() {
      anchor = null;
    },
    settle() {
      if (anchor) anchor.entered = false;
    },
    scroll(scrollTop: number) {
      const next = readingRow(scrollTop);
      const entered = !!next && !!anchor && (next.id !== anchor.id || anchor.entered);
      anchor = next ? { id: next.id, top: next.top, height: next.height, entered } : null;
    },
    reconcile(scrollTop: number, rows: readonly RowGeometry[], userScrolled = false): number {
      geometry = rows;
      const previous = anchor && rows.find((row) => row.id === anchor?.id);
      // The first virtualized commit can precede its mounted range. Keep the
      // pinned reader until it mounts, rather than adopting an unrelated row.
      if (anchor && !previous && !userScrolled) return scrollTop;
      const correctedTop = project(scrollTop, previous ?? undefined);
      // A prepend can expose the bottom of an estimated row above the reader.
      // Do not transfer ownership to it until the user moves the reading position.
      const next = previous && !userScrolled ? previous : readingRow(correctedTop);
      anchor = next
        ? {
            id: next.id,
            top: next.top,
            height: next.height,
            entered: next.id === anchor?.id && anchor.entered,
          }
        : null;
      return correctedTop;
    },
  };
}
