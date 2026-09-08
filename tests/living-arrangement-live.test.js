import { beforeAll, describe, expect, it } from "vitest";
import { buildCellResults, getCategorizedPrograms, getHeatmapData } from "../lib/api";

describe("live US living-arrangement comparisons", () => {
  let together, separate, grid;
  const extras = { livingArrangement: "cohabiting" };
  const children = [{ age: 5 }];
  beforeAll(async () => {
    [together, separate, grid] = await Promise.all([
      getCategorizedPrograms("us", "CA", 15000, 10000, children, {}, "2026", {}, 40, 40, {}, false, extras),
      getCategorizedPrograms("us", "CA", 15000, 10000, children, {}, "2026"),
      getHeatmapData("us", "CA", children, {}, "2026", {}, 15000, 10000, 40, 40, {}, false, extras),
    ]);
  }, 120000);

  it("keeps shared-food SNAP unchanged by marriage while separate homes differ", () => {
    expect(together.unmarried.benefits.snap).toBeGreaterThan(0);
    expect(Math.abs(together.married.benefits.snap - together.unmarried.benefits.snap)).toBeLessThan(0.05);
    expect(separate.headSingle.benefits.snap + separate.spouseSingle.benefits.snap)
      .not.toBeCloseTo(together.unmarried.benefits.snap, 2);
  });

  it("matches every scalar output at unequal incomes in the heatmap", () => {
    const cell = buildCellResults("us", grid.programData, 6, 4, grid.count, grid.stateCreditEntries, extras);
    for (const scenario of ["married", "unmarried"]) {
      for (const [category, values] of Object.entries(together[scenario])) {
        for (const [key, value] of Object.entries(values)) {
          expect(Math.abs(cell[scenario][category][key] - value), `${scenario}.${category}.${key}`).toBeLessThan(0.05);
        }
      }
    }
    const expected = together.married.aggregates.householdNetIncome - together.unmarried.aggregates.householdNetIncome;
    expect(Math.abs(grid.grids["net income"][4][6] - expected)).toBeLessThan(0.05);
  });

  it("includes credits from both unmarried tax returns in the household total", () => {
    const r = together.unmarried;
    const credits = Object.values(r.credits).reduce((sum, value) => sum + value, 0)
      + r.stateCredits.state_refundable_credits;
    expect(Math.abs(credits - r.aggregates.householdRefundableCredits)).toBeLessThan(0.05);
  });
});
