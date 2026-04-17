/**
 * Unit tests for heatmap utility functions.
 * TDD: written before the SVG implementation replaces Plotly.
 */

import { describe, it, expect } from "vitest";
import {
  interpolateColor,
  TEAL_SCALE,
  VALENTINE_SCALE,
  fmtDollar,
  fmtShortDollar,
} from "../lib/heatmap-utils.js";

// ---------- interpolateColor ----------

describe("interpolateColor", () => {
  it("returns the first color at t=0", () => {
    const c = interpolateColor(TEAL_SCALE, 0);
    expect(c).toBe("rgb(31,41,55)"); // #1F2937
  });

  it("returns the last color at t=1", () => {
    const c = interpolateColor(TEAL_SCALE, 1);
    expect(c).toBe("rgb(13,148,136)"); // #0D9488
  });

  it("returns midpoint color at t=0.5", () => {
    const c = interpolateColor(TEAL_SCALE, 0.5);
    expect(c).toBe("rgb(209,213,219)"); // #D1D5DB
  });

  it("clamps t below 0 to 0", () => {
    expect(interpolateColor(TEAL_SCALE, -0.5)).toBe(interpolateColor(TEAL_SCALE, 0));
  });

  it("clamps t above 1 to 1", () => {
    expect(interpolateColor(TEAL_SCALE, 1.5)).toBe(interpolateColor(TEAL_SCALE, 1));
  });

  it("works with VALENTINE_SCALE at t=0.5", () => {
    const c = interpolateColor(VALENTINE_SCALE, 0.5);
    expect(c).toBe("rgb(209,213,219)"); // #D1D5DB
  });

  it("interpolates between stops", () => {
    // Between 0.55 (#D1D5DB) and 0.65 (#81E6D9) at midpoint 0.6
    const c = interpolateColor(TEAL_SCALE, 0.6);
    expect(c).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    // Parse and verify it's between the two stops
    const [r, g, b] = c.match(/\d+/g).map(Number);
    expect(r).toBeGreaterThanOrEqual(129); // 0x81
    expect(r).toBeLessThanOrEqual(209); // 0xD1
  });
});

// ---------- fmtDollar ----------

describe("fmtDollar", () => {
  it("formats positive values with $", () => {
    expect(fmtDollar(1234)).toBe("$1,234");
  });

  it("formats negative values with -$", () => {
    expect(fmtDollar(-5678)).toBe("-$5,678");
  });

  it("formats zero as $0", () => {
    expect(fmtDollar(0)).toBe("$0");
  });

  it("rounds to nearest integer", () => {
    expect(fmtDollar(1234.7)).toBe("$1,235");
    expect(fmtDollar(-99.4)).toBe("-$99");
  });

  it("formats large values with commas", () => {
    expect(fmtDollar(1234567)).toBe("$1,234,567");
  });
});

// ---------- fmtShortDollar ----------

describe("fmtShortDollar", () => {
  it("uses k suffix for thousands", () => {
    expect(fmtShortDollar(10000)).toBe("$10k");
  });

  it("handles negative thousands", () => {
    expect(fmtShortDollar(-5000)).toBe("-$5k");
  });

  it("shows exact value below 1000", () => {
    expect(fmtShortDollar(500)).toBe("$500");
  });

  it("formats zero as $0", () => {
    expect(fmtShortDollar(0)).toBe("$0");
  });

  it("rounds to nearest k for non-round thousands", () => {
    expect(fmtShortDollar(7500)).toBe("$8k");
  });
});

// ---------- Color scales ----------

describe("color scales", () => {
  it("TEAL_SCALE has 7 stops from 0 to 1", () => {
    expect(TEAL_SCALE).toHaveLength(7);
    expect(TEAL_SCALE[0][0]).toBe(0);
    expect(TEAL_SCALE[TEAL_SCALE.length - 1][0]).toBe(1);
  });

  it("VALENTINE_SCALE has 7 stops from 0 to 1", () => {
    expect(VALENTINE_SCALE).toHaveLength(7);
    expect(VALENTINE_SCALE[0][0]).toBe(0);
    expect(VALENTINE_SCALE[VALENTINE_SCALE.length - 1][0]).toBe(1);
  });

  it("both scales share the same dark stops (0, 0.3)", () => {
    expect(TEAL_SCALE[0][1]).toBe(VALENTINE_SCALE[0][1]);
    expect(TEAL_SCALE[1][1]).toBe(VALENTINE_SCALE[1][1]);
  });
});
