/**
 * Heatmap hover breakdown.
 *
 * The headline number says a couple is better or worse off together; it does
 * not say which programs cause that. These check the attribution, including
 * the sign convention, since getting that backwards would tell an analyst the
 * opposite of the truth.
 */

import { describe, it, expect } from "vitest";
import { buildCellBreakdown } from "../lib/api.js";

const COUNT = 3;

// married is a COUNT x COUNT grid flattened as [headIdx * COUNT + spouseIdx];
// head and spouse are one-dimensional lines.
function grid(marriedAt11, headAt1, spouseAt1) {
  const married = new Array(COUNT * COUNT).fill(0);
  married[1 * COUNT + 1] = marriedAt11;
  const head = [0, headAt1, 0];
  const spouse = [0, spouseAt1, 0];
  return { married, head, spouse };
}

describe("buildCellBreakdown", () => {
  it("reports a benefit the couple keeps by living together as positive", () => {
    const programData = { universal_credit: grid(5000, 1000, 1000) };
    const rows = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    const uc = rows.find((r) => r.variable === "universal_credit");
    expect(uc).toBeDefined();
    expect(uc.delta).toBe(3000);
  });

  it("reports a benefit lost by living together as negative", () => {
    const programData = { universal_credit: grid(1000, 3000, 3000) };
    const rows = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    expect(rows.find((r) => r.variable === "universal_credit").delta).toBe(-5000);
  });

  it("flips the sign on taxes, so positive always favours living together", () => {
    // Paying MORE tax together must read as a negative for the couple.
    const programData = { income_tax: grid(5000, 1000, 1000) };
    const rows = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    const tax = rows.find((r) => r.variable === "income_tax");
    expect(tax).toBeDefined();
    expect(tax.delta).toBe(-3000);
  });

  it("orders by size, not by program", () => {
    const programData = {
      universal_credit: grid(2000, 500, 500),
      child_benefit: grid(9000, 0, 0),
    };
    const rows = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    expect(Math.abs(rows[0].delta)).toBeGreaterThanOrEqual(Math.abs(rows[1].delta));
    expect(rows[0].variable).toBe("child_benefit");
  });

  it("drops programs that do not move, which are noise in a hover", () => {
    const programData = {
      universal_credit: grid(1000, 500, 500),
      child_benefit: grid(0, 0, 0),
    };
    const rows = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    expect(rows.every((r) => Math.round(r.delta) !== 0)).toBe(true);
    expect(rows.find((r) => r.variable === "child_benefit")).toBeUndefined();
  });

  it("caps the list so the hover stays readable", () => {
    const programData = {};
    for (const v of ["universal_credit", "child_benefit", "income_tax", "national_insurance", "pension_credit"]) {
      programData[v] = grid(9000, 100, 100);
    }
    expect(buildCellBreakdown("uk", programData, 1, 1, COUNT).length).toBeLessThanOrEqual(4);
    expect(buildCellBreakdown("uk", programData, 1, 1, COUNT, 2)).toHaveLength(2);
  });

  it("returns nothing rather than throwing on missing data", () => {
    expect(buildCellBreakdown("uk", {}, 1, 1, COUNT)).toEqual([]);
    expect(buildCellBreakdown("uk", { universal_credit: { married: [] } }, 1, 1, COUNT)).toEqual([]);
  });

  it("indexes the married grid by head and spouse, not one line", () => {
    const programData = { universal_credit: grid(5000, 0, 0) };
    // The value sits at [1][1]; a different cell must not pick it up.
    expect(buildCellBreakdown("uk", programData, 0, 0, COUNT)).toEqual([]);
    expect(buildCellBreakdown("uk", programData, 1, 1, COUNT)[0].delta).toBe(5000);
  });
});
