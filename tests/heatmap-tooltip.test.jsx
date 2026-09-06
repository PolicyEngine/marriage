/**
 * Heatmap tooltip stays inside the chart.
 *
 * The tooltip is centred on the cursor. Once it gained the per-program
 * breakdown it grew tall enough that hovering near the bottom of the chart
 * pushed half of it below the card, where `.single-heatmap { overflow: hidden }`
 * cut it off mid-row.
 *
 * These test the clamp arithmetic directly. The component measures the rendered
 * tooltip and applies the same rule, which jsdom cannot exercise because it
 * reports every element as zero-sized.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from "vitest";

const MARGIN = 8;

// Mirrors the clamp in Heatmap.jsx.
function place(cursorY, tooltipHeight, containerHeight) {
  if (tooltipHeight + MARGIN * 2 >= containerHeight) {
    return { top: MARGIN, transform: "none" };
  }
  const half = tooltipHeight / 2;
  return {
    top: Math.min(Math.max(cursorY, half + MARGIN), containerHeight - half - MARGIN),
    transform: "translateY(-50%)",
  };
}

// Where the tooltip's edges land once the transform is applied.
function bounds({ top, transform }, height) {
  const t = transform === "none" ? top : top - height / 2;
  return { top: t, bottom: t + height };
}

describe("tooltip stays within the chart", () => {
  const CONTAINER = 500;
  const TALL = 260; // roughly a tooltip with a full breakdown

  it("keeps a tall tooltip on screen when hovering near the bottom", () => {
    // The reported case: cursor low, tooltip cut off at the card edge.
    const b = bounds(place(480, TALL, CONTAINER), TALL);
    expect(b.bottom).toBeLessThanOrEqual(CONTAINER);
    expect(b.top).toBeGreaterThanOrEqual(0);
  });

  it("keeps it on screen when hovering near the top", () => {
    const b = bounds(place(5, TALL, CONTAINER), TALL);
    expect(b.top).toBeGreaterThanOrEqual(0);
    expect(b.bottom).toBeLessThanOrEqual(CONTAINER);
  });

  it("still centres on the cursor when there is room", () => {
    const p = place(250, TALL, CONTAINER);
    expect(p.top).toBe(250);
    expect(p.transform).toBe("translateY(-50%)");
  });

  it("never leaves the chart at any cursor position", () => {
    for (let y = 0; y <= CONTAINER; y += 10) {
      const b = bounds(place(y, TALL, CONTAINER), TALL);
      expect(b.top, `cursor ${y}`).toBeGreaterThanOrEqual(0);
      expect(b.bottom, `cursor ${y}`).toBeLessThanOrEqual(CONTAINER);
    }
  });

  it("pins to the top when the tooltip is taller than the chart", () => {
    // Clamping cannot fit it, so show the start rather than the middle.
    const p = place(300, 600, CONTAINER);
    expect(p.top).toBe(MARGIN);
    expect(p.transform).toBe("none");
    expect(bounds(p, 600).top).toBe(MARGIN);
  });

  it("handles a short tooltip unchanged", () => {
    const p = place(250, 60, CONTAINER);
    expect(p.top).toBe(250);
  });
});
