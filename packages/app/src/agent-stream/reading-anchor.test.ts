import { describe, expect, it } from "vitest";
import { createReadingAnchor } from "./reading-anchor";

describe("reading anchor", () => {
  const rows = [
    { id: "above", top: 0, height: 500 },
    { id: "reading", top: 500, height: 500 },
    { id: "below", top: 1000, height: 500 },
  ];

  it("preserves wheel movement during an asynchronous prepend", () => {
    const anchor = createReadingAnchor();
    anchor.reconcile(600, rows);
    expect(
      anchor.reconcile(
        440,
        rows.map((row) => ({ id: row.id, height: row.height, top: row.top + 2000 })),
      ),
    ).toBe(2440);
    expect(
      anchor.reconcile(
        2280,
        rows.map((row) => ({ id: row.id, height: row.height, top: row.top + 2000 })),
      ),
    ).toBe(2280);
  });

  it("ignores growth below the reader and compensates growth above", () => {
    const anchor = createReadingAnchor();
    anchor.reconcile(600, rows);
    expect(anchor.reconcile(600, [rows[0]!, rows[1]!, { ...rows[2]!, height: 2000 }])).toBe(600);
    expect(
      anchor.reconcile(600, [
        { ...rows[0]!, height: 1000 },
        { ...rows[1]!, top: 1000 },
        { ...rows[2]!, top: 1500 },
      ]),
    ).toBe(1100);
  });

  it("leaves expansion of the row being read in place", () => {
    const anchor = createReadingAnchor();
    anchor.reconcile(600, rows);
    expect(
      anchor.reconcile(600, [rows[0]!, { ...rows[1]!, height: 1000 }, { ...rows[2]!, top: 1500 }]),
    ).toBe(600);
  });

  describe("a row that shrinks", () => {
    const placeholder = [
      { id: "text", top: 0, height: 300 },
      { id: "image", top: 300, height: 560 },
      { id: "below", top: 860, height: 300 },
    ];
    const loaded = [
      placeholder[0]!,
      { ...placeholder[1]!, height: 225 },
      { ...placeholder[2]!, top: 525 },
    ];

    it("holds the text it was entered from when the reader scrolls up into it", () => {
      const anchor = createReadingAnchor();
      anchor.reconcile(860, placeholder);
      expect(anchor.getRowId()).toBe("below");
      // The wheel moves the line 160px into the image before the image loads.
      anchor.scroll(700);
      expect(anchor.getRowId()).toBe("image");
      // "below" was 160px under the line and stays there.
      expect(anchor.reconcile(700, loaded)).toBe(365);
    });

    it("keeps the top of a row the reader was already inside", () => {
      const anchor = createReadingAnchor();
      anchor.reconcile(700, placeholder);
      expect(anchor.getRowId()).toBe("image");
      expect(anchor.reconcile(700, loaded)).toBe(700);
    });

    it("follows through commits in the frame that entered the row", () => {
      const anchor = createReadingAnchor();
      anchor.reconcile(860, placeholder);
      anchor.scroll(700);
      anchor.reconcile(700, placeholder);
      expect(anchor.reconcile(700, loaded)).toBe(365);
    });

    it("keeps the top once the frame that entered the row has settled", () => {
      const anchor = createReadingAnchor();
      anchor.reconcile(860, placeholder);
      anchor.scroll(700);
      anchor.settle();
      expect(anchor.reconcile(700, loaded)).toBe(700);
    });

    it("keeps a row the reader scrolled into from its top where it is", () => {
      const anchor = createReadingAnchor();
      anchor.reconcile(0, placeholder);
      anchor.scroll(300);
      expect(anchor.getRowId()).toBe("image");
      // Only the 8px above the reading line can be followed.
      expect(anchor.reconcile(300, loaded)).toBe(292);
    });
  });

  it("projects the same shrink correction the layout will apply", () => {
    const anchor = createReadingAnchor();
    anchor.reconcile(860, [
      { id: "image", top: 300, height: 560 },
      { id: "below", top: 860, height: 300 },
    ]);
    anchor.scroll(700);
    expect(anchor.project(700, { id: "image", top: 300, height: 225 })).toBe(365);
    expect(anchor.project(700, { id: "image", top: 300 })).toBe(700);
  });

  it("keeps the existing reader through prepend measurements until the user scrolls", () => {
    const anchor = createReadingAnchor();
    anchor.reconcile(0, [{ id: "reading", top: 48, height: 100 }]);
    const prepended = [
      { id: "new", top: 2000, height: 57 },
      { id: "reading", top: 2057, height: 100 },
    ];
    expect(anchor.reconcile(0, prepended)).toBe(2009);
    expect(anchor.getRowId()).toBe("reading");
    const measured = [
      { id: "new", top: 2000, height: 100 },
      { id: "reading", top: 2100, height: 100 },
    ];
    expect(anchor.reconcile(2009, measured)).toBe(2052);
    expect(anchor.getRowId()).toBe("reading");
    expect(anchor.reconcile(2000, measured, true)).toBe(2000);
    expect(anchor.getRowId()).toBe("new");
  });

  it("retains the reader while the virtualizer initializes its mounted range", () => {
    const anchor = createReadingAnchor();
    anchor.reconcile(600, rows);
    anchor.reconcile(600, [rows[2]!]);
    expect(anchor.getRowId()).toBe("reading");
    expect(
      anchor.reconcile(
        600,
        rows.map((row) => ({ ...row, top: row.top + 2000 })),
      ),
    ).toBe(2600);
  });

  it("projects a prepend range without consuming the correction before layout commits", () => {
    const anchor = createReadingAnchor();
    anchor.reconcile(600, rows);
    expect(anchor.project(440, { id: "reading", top: 2500 })).toBe(2440);
    expect(anchor.project(440, { id: "reading", top: 2500 })).toBe(2440);
    expect(
      anchor.reconcile(
        440,
        rows.map((row) => ({ ...row, top: row.top + 2000 })),
        true,
      ),
    ).toBe(2440);
    expect(anchor.getRowId()).toBe("above");
  });

  it("repicks from user movement before applying a simultaneous layout correction", () => {
    const anchor = createReadingAnchor();
    anchor.reconcile(600, rows);
    anchor.scroll(440);
    expect(anchor.getRowId()).toBe("above");
    expect(
      anchor.reconcile(
        440,
        rows.map((row) => ({ ...row, top: row.top + 2000 })),
      ),
    ).toBe(2440);
    expect(anchor.getRowId()).toBe("above");
  });

  it("releases the old reading position for explicit navigation", () => {
    const anchor = createReadingAnchor();
    anchor.reconcile(600, rows);
    anchor.reset();
    expect(anchor.getRowId()).toBeNull();
    expect(
      anchor.reconcile(
        0,
        rows.map((row) => ({ id: row.id, height: row.height, top: row.top + 2000 })),
      ),
    ).toBe(0);
  });
});
