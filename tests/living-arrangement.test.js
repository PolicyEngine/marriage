import { afterEach, describe, expect, it, vi } from "vitest";
import { createSituation, getCategorizedPrograms, getHeatmapData, buildCellResults, buildCellBreakdown } from "../lib/api";
import { computeTableData, unmarriedTotal } from "../lib/utils";
import metadata from "../lib/metadata.json";

const extras = { livingArrangement: "cohabiting" };
const situation = (options = extras) => createSituation(
  "us", "CA", 20000, {}, 10000, [{ age: 5 }], "2026", {}, 40, 40, {}, false, options,
);

afterEach(() => vi.unstubAllGlobals());

// Populate each requested output, with different tax-unit values and a joint
// grid that cannot be reconstructed by adding independent income lines.
function mockApi() {
  const requests = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    const s = JSON.parse(options.body).household;
    requests.push(structuredClone(s));
    const joint = Object.keys(s.tax_units).length === 2;
    const count = s.axes?.[0][0].count || 1;
    const length = s.axes?.length === 2 ? count * count : count;
    for (const [container, entities] of Object.entries(s)) {
      if (container === "axes") continue;
      Object.values(entities).forEach((entity, entityIdx) => {
        for (const [variable, periods] of Object.entries(entity)) {
          if (periods?.["2026"] !== null) continue;
          periods["2026"] = Array.from({ length }, (_, apiIdx) => {
            // These fixtures contain no paid care. Preserve that premise when
            // the API also requests childcare costs and assistance outputs.
            if (["childcare_expenses", "child_care_subsidies", "vt_ccfap_family_share"].includes(variable)) return 0;
            // API axes are first-axis-fastest; the UI's storage is head-major.
            const idx = s.axes?.length === 2
              ? (apiIdx % count) * count + Math.floor(apiIdx / count) : apiIdx;
            return container === "tax_units" ? 100 * (entityIdx + 1) :
              joint ? 200 + idx * idx : 1000 + idx;
          });
        }
      });
    }
    return { ok: true, json: async () => ({ result: s, model_version: metadata.modelVersion }) };
  }));
  return requests;
}

describe("cohabiting comparison", () => {
  it("keeps shared SNAP resources but separates tax and marital units", () => {
    const s = situation();
    expect(Object.values(s.households)).toHaveLength(1);
    expect(Object.values(s.spm_units)).toHaveLength(1);
    expect(s.spm_units["your spm_unit"].members).toEqual(["you", "your partner", "child_1"]);
    expect(s.tax_units["your tax unit"].members).toEqual(["you", "child_1"]);
    expect(s.tax_units["your partner's tax unit"].members).toEqual(["your partner"]);
    expect(s.marital_units["your marital unit"].members).toEqual(["you"]);
    expect(s.marital_units["your partner's marital unit"].members).toEqual(["your partner"]);
    expect(s.tax_units["your partner's tax unit"].tax_unit_id["2026"]).not.toBe(s.tax_units["your tax unit"].tax_unit_id["2026"]);
    expect(s.people.you.own_children_in_household["2026"]).toBe(1);
    expect(s.people["your partner"].own_children_in_household["2026"]).toBe(1);
  });

  it("retains the legacy married situation unless the counterfactual is requested", () => {
    expect(Object.values(situation({}).tax_units)).toHaveLength(1);
  });

  it("requests and sums both tax units, including state credit details", async () => {
    const requests = mockApi();
    const r = await getCategorizedPrograms("us", "CA", 20000, 10000, [{ age: 5 }], {}, "2026", {}, 40, 40, {}, false, extras);
    expect(requests).toHaveLength(2);
    expect(Object.values(requests[0].tax_units)).toHaveLength(1);
    expect(Object.values(requests[1].tax_units)).toHaveLength(2);
    expect(r).not.toHaveProperty("headSingle");
    expect(r.unmarried.credits.eitc).toBe(300);
    expect(r.unmarried.stateCredits.CalEITC).toBe(300);
  });

  it("uses the whole two-income counterfactual in grids, cells, and tooltips", async () => {
    const requests = mockApi();
    const grid = await getHeatmapData("us", "CA", [], {}, "2026", {}, 20000, 10000, 40, 40, {}, false, extras);
    expect(requests).toHaveLength(2);
    expect(requests[1].axes).toHaveLength(2);
    const h = 2, p = 3, idx = h * grid.count + p;
    const delta = (1000 + idx) - (200 + idx * idx);
    expect(grid.grids["net income"][p][h]).toBe(delta);
    const cell = buildCellResults("us", grid.programData, h, p, grid.count, grid.stateCreditEntries, extras);
    expect(cell.unmarried.aggregates.householdNetIncome).toBe(200 + idx * idx);
    expect(cell.unmarried.credits.eitc).toBe(300);
    const rows = buildCellBreakdown("us", grid.programData, h, p, grid.count, Infinity).flatMap(g => g.rows);
    expect(rows.find(r => r.variable === "snap").delta).toBe(delta);
  });

  it("shows household totals without attributing shared benefits to either partner", async () => {
    mockApi();
    const r = await getCategorizedPrograms("us", "CA", 20000, 10000, [], {}, "2026", {}, 40, 40, {}, false, extras);
    expect(unmarriedTotal(r, "credits", "eitc")).toBe(300);
    r.married.aggregates.householdNetIncome = 89352.69;
    r.unmarried.aggregates.householdNetIncome = 90554.33;
    expect(computeTableData(r, "summary")[0].delta).toBe("-$1,202");
    for (const tab of ["summary", "benefits", "credits", "taxes"]) {
      const rows = computeTableData(r, tab);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(row => row.headSingle === null && row.spouseSingle === null)).toBe(true);
      expect(rows.every(row => Number.isFinite(row.rawDelta))).toBe(true);
    }
  });
});
