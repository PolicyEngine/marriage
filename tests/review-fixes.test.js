/**
 * Regressions from the PR #122 review.
 *
 * Each of these reproduces a defect the review found, so that the specific way
 * it went wrong cannot come back.
 */

import { describe, it, expect } from "vitest";
import {
  buildCellResults, buildCellBreakdown, createSituation,
} from "../lib/api.js";
import { computeTableData } from "../lib/utils.js";
import { COUNTRIES, DEFAULT_COUNTRY, LEGACY_HASH_COUNTRY, UK_BRMAS, DEFAULT_BRMA } from "../lib/countries.js";

const Y = "2026";
const COUNT = 3;
const RENT = { rent: 12000, tenureType: "RENT_PRIVATELY" };

// One cell of programData: married indexed [head * COUNT + spouse].
function series(marriedAt11, headAt1, spouseAt1) {
  const married = new Array(COUNT * COUNT).fill(0);
  married[1 * COUNT + 1] = marriedAt11;
  return { married, head: [0, headAt1, 0], spouse: [0, spouseAt1, 0] };
}

describe("C1: selecting a heatmap cell keeps the rent deduction", () => {
  const programData = {
    household_net_income: series(28000, 10500, 10500),
    financial_resources: series(28000, 10500, 10500),
    rent_deducted: series(12000, 12000, 12000),
    household_benefits: series(0, 0, 0),
    household_tax: series(0, 0, 0),
  };

  it("preserves the backend rent deduction in every scenario", () => {
    const withRent = buildCellResults("uk", programData, 1, 1, COUNT, [], RENT);
    expect(withRent.married.aggregates.householdNetIncome).toBe(40000 - 12000);
    // Each separate household pays its own rent.
    expect(withRent.headSingle.aggregates.householdNetIncome).toBe(22500 - 12000);
    expect(withRent.spouseSingle.aggregates.householdNetIncome).toBe(22500 - 12000);
  });

  it("does not change the sign of the result relative to the grid", () => {
    // The review's case: a bonus in the grid became a penalty after selection.
    const cell = buildCellResults("uk", programData, 1, 1, COUNT, [], RENT);
    const together = cell.married.aggregates.householdNetIncome;
    const apart =
      cell.headSingle.aggregates.householdNetIncome +
      cell.spouseSingle.aggregates.householdNetIncome;
    // Grid delta, computed the same way getHeatmapData does.
    const gridTogether = 40000 - 12000;
    const gridApart = (22500 - 12000) + (22500 - 12000);
    expect(Math.sign(apart - together)).toBe(Math.sign(gridApart - gridTogether));
    expect(apart - together).toBe(gridApart - gridTogether);
  });

  it("does not recalculate housing accounting from display extras", () => {
    const cell = buildCellResults("uk", programData, 1, 1, COUNT, [], {});
    expect(cell.married.aggregates.householdNetIncome).toBe(28000);
    expect(cell.married.aggregates.rentDeducted).toBe(12000);
  });

});

describe("C2: share links keep their country", () => {
  it("treats a hash with no country as US, not as the current default", () => {
    // Legacy links look like #region=CA&head=50000&spouse=30000. They predate
    // the UK route, so reading them as the default would send CA to the UK.
    expect(LEGACY_HASH_COUNTRY).toBe("us");
    // Kept separate from DEFAULT_COUNTRY on purpose: they happen to match
    // today, but a legacy hash must decode as US however the default moves.
    expect(LEGACY_HASH_COUNTRY).toBe("us");
  });

  it("a US region is not a valid UK region, so the mix-up is not silent", () => {
    const ukRegions = COUNTRIES.uk.regions.map((r) => r.code);
    expect(ukRegions).not.toContain("CA");
  });
});

describe("C3: the summary table does not invent earnings", () => {
  function scenario(net, benefits, tax, rentDeducted) {
    return {
      aggregates: {
        householdNetIncome: net,
        householdNetIncomeWithHealth: net,
        householdBenefits: benefits,
        householdRefundableCredits: 0,
        householdTaxBeforeCredits: tax,
        healthcareBenefitValue: 0,
        ...(rentDeducted ? { rentDeducted } : {}),
      },
      benefits: {}, taxes: {}, credits: {}, health: {}, stateCredits: {}, stateTaxes: {},
    };
  }

  // Two adults on £15,000 each, £12,000 rent per household.
  const results = {
    married: scenario(30000 - 12000, 0, 0, 12000),
    headSingle: scenario(15000 - 12000, 0, 0, 12000),
    spouseSingle: scenario(15000 - 12000, 0, 0, 12000),
  };

  const rows = computeTableData(results, "summary", false, "uk", "£");
  const row = (name) => rows.find((r) => r.program === name);

  it("reports real earnings, unchanged by living apart", () => {
    // Before the fix this showed £18,000 together against £6,000 apart, and a
    // £12,000 "bonus" that was really just the rent deduction.
    const earnings = row("Earnings");
    expect(earnings).toBeDefined();
    expect(earnings.rawDelta).toBe(0);
    expect(earnings.married).toContain("30,000");
    expect(earnings.notMarried).toContain("30,000");
  });

  it("shows housing costs as their own line rather than an unexplained gap", () => {
    const housing = row("Housing costs");
    expect(housing).toBeDefined();
    expect(housing.married).toContain("12,000");
    expect(housing.notMarried).toContain("24,000");
    // A cost, so paying one rent instead of two favours living together.
    expect(housing.rawDelta).toBe(12000);
  });

  it("omits the housing line when no rent was deducted", () => {
    const noRent = {
      married: scenario(30000, 0, 0, 0),
      headSingle: scenario(15000, 0, 0, 0),
      spouseSingle: scenario(15000, 0, 0, 0),
    };
    const r = computeTableData(noRent, "summary", false, "uk", "£");
    expect(r.find((x) => x.program === "Housing costs")).toBeUndefined();
  });
});

describe("A1: the rental market area is an input, not a hidden default", () => {
  it("offers the areas the model recognises", () => {
    expect(UK_BRMAS.length).toBeGreaterThan(100);
    const codes = UK_BRMAS.map((a) => a.code);
    expect(codes).toContain("CENTRAL_LONDON");
    expect(codes).toContain("MAIDSTONE");
  });

  it("sends the area on the household, where the model reads it", () => {
    const s = createSituation(
      "uk", "ENGLAND", 15000, { head: false }, null, [], Y, {}, 35, 35, {}, false,
      { ...RENT, brma: "CENTRAL_LONDON" },
    );
    expect(s.households["your household"].brma[Y]).toBe("CENTRAL_LONDON");
  });

  it("falls back to the model's own default rather than an invented one", () => {
    const s = createSituation(
      "uk", "ENGLAND", 15000, { head: false }, null, [], Y, {}, 35, 35, {}, false, RENT,
    );
    expect(s.households["your household"].brma[Y]).toBe(DEFAULT_BRMA);
    expect(DEFAULT_BRMA).toBe("MAIDSTONE");
  });
});

describe("A2: hover drivers match the category being shown", () => {
  const programData = {
    universal_credit: series(0, 2500, 2500),
    income_tax: series(0, 0, 0),
  };

  it("does not offer a benefit as the driver of a tax heatmap", () => {
    const taxOnly = buildCellBreakdown("uk", programData, 1, 1, COUNT, 6, "taxes");
    expect(taxOnly.every((g) => g.key === "taxes")).toBe(true);
    expect(taxOnly.flatMap((g) => g.rows).find((r) => r.variable === "universal_credit"))
      .toBeUndefined();
  });

  it("still shows every category on the net income view", () => {
    const all = buildCellBreakdown("uk", programData, 1, 1, COUNT, 6, null);
    expect(all.flatMap((g) => g.rows).find((r) => r.variable === "universal_credit"))
      .toBeDefined();
  });
});
