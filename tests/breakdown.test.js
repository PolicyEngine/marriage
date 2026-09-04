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

// Flatten the grouped result for assertions that do not care about grouping.
function flat(groups) {
  return groups.flatMap((g) => g.rows);
}

function find(groups, variable) {
  return flat(groups).find((r) => r.variable === variable);
}

describe("buildCellBreakdown", () => {
  it("reports a benefit the couple keeps by living together as positive", () => {
    const programData = { universal_credit: grid(5000, 1000, 1000) };
    const groups = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    const uc = find(groups, "universal_credit");
    expect(uc).toBeDefined();
    expect(uc.delta).toBe(3000);
    expect(groups.find((g) => g.key === "benefits")).toBeDefined();
  });

  it("reports a benefit lost by living together as negative", () => {
    const programData = { universal_credit: grid(1000, 3000, 3000) };
    const groups = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    expect(find(groups, "universal_credit").delta).toBe(-5000);
  });

  it("flips the sign on taxes, so positive always favours living together", () => {
    // Paying MORE tax together must read as a negative for the couple.
    const programData = { income_tax: grid(5000, 1000, 1000) };
    const groups = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    const tax = find(groups, "income_tax");
    expect(tax).toBeDefined();
    expect(tax.delta).toBe(-3000);
    expect(groups.find((g) => g.key === "taxes").rows).toContain(tax);
  });

  it("orders by size, not by program", () => {
    const programData = {
      universal_credit: grid(2000, 500, 500),
      child_benefit: grid(9000, 0, 0),
    };
    const rows = flat(buildCellBreakdown("uk", programData, 1, 1, COUNT));
    expect(Math.abs(rows[0].delta)).toBeGreaterThanOrEqual(Math.abs(rows[1].delta));
    expect(rows[0].variable).toBe("child_benefit");
  });

  it("drops programs that do not move, which are noise in a hover", () => {
    const programData = {
      universal_credit: grid(1000, 500, 500),
      child_benefit: grid(0, 0, 0),
    };
    const groups = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    expect(flat(groups).every((r) => Math.round(r.delta) !== 0)).toBe(true);
    expect(find(groups, "child_benefit")).toBeUndefined();
  });

  it("separates benefits from taxes, so both are visible at once", () => {
    // A flat top-N list could be filled entirely by benefits and hide the tax
    // side, which is half the story for a couple moving across a threshold.
    const programData = {
      universal_credit: grid(9000, 100, 100),
      child_benefit: grid(8000, 100, 100),
      housing_benefit: grid(7000, 100, 100),
      pension_credit: grid(6000, 100, 100),
      income_tax: grid(500, 100, 100),
      national_insurance: grid(400, 100, 100),
    };
    const groups = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    const keys = groups.map((g) => g.key);
    expect(keys).toContain("benefits");
    expect(keys).toContain("taxes");
    expect(find(groups, "income_tax")).toBeDefined();
    expect(find(groups, "national_insurance")).toBeDefined();
  });

  it("caps each group so the hover stays readable", () => {
    const programData = {};
    for (const v of ["universal_credit", "child_benefit", "housing_benefit", "pension_credit", "income_support"]) {
      programData[v] = grid(9000, 100, 100);
    }
    const capped = buildCellBreakdown("uk", programData, 1, 1, COUNT, 2);
    expect(capped.find((g) => g.key === "benefits").rows).toHaveLength(2);
  });

  it("omits a group entirely when nothing in it moves", () => {
    const programData = { universal_credit: grid(5000, 100, 100) };
    const groups = buildCellBreakdown("uk", programData, 1, 1, COUNT);
    expect(groups.map((g) => g.key)).toEqual(["benefits"]);
  });

  it("returns nothing rather than throwing on missing data", () => {
    expect(buildCellBreakdown("uk", {}, 1, 1, COUNT)).toEqual([]);
    expect(buildCellBreakdown("uk", { universal_credit: { married: [] } }, 1, 1, COUNT)).toEqual([]);
  });

  it("indexes the married grid by head and spouse, not one line", () => {
    const programData = { universal_credit: grid(5000, 0, 0) };
    // The value sits at [1][1]; a different cell must not pick it up.
    expect(buildCellBreakdown("uk", programData, 0, 0, COUNT)).toEqual([]);
    expect(flat(buildCellBreakdown("uk", programData, 1, 1, COUNT))[0].delta).toBe(5000);
  });
});
