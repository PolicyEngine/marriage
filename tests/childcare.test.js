import { describe, it, expect } from "vitest";
import { createSituation, getCategorizedPrograms, getPrograms, getHeatmapData, buildCellResults } from "../lib/api";
import { normalizeUSChildcare } from "../lib/childcare";
import metadata from "../lib/childcare-metadata.json";
import { computeTableData } from "../lib/utils";

const child = state => ({ age: 3, childcareCost: 12000, childcareHoursPerDay: 8,
  childcareDaysPerWeek: 5, childcareDaysPerMonth: 22,
  childcareProviders: Object.fromEntries(metadata.states[state].providers.map(field => [field.variable, field.options[0].value])),
});
const extras = state => ({ ccdfSlotAvailable: true, childcareCounty: metadata.counties[state][0].value,
  childcareWorkHours: { head: 40, spouse: 30 }, livingArrangement: "cohabiting" });

describe("childcare inputs and accounting", () => {
  it("uses one SSI medical flag for both disability inputs for every person", () => {
    const s = createSituation("us", "CA", 0, { head: true, spouse: false }, 0, [{ age: 8, isDisabled: true }], "2026");
    for (const [name, expected] of [["you", true], ["your partner", false], ["child_1", true]]) {
      expect(s.people[name].is_disabled[2026]).toBe(expected);
      expect(s.people[name].meets_ssi_disability_criteria[2026]).toBe(expected);
      expect(s.people[name].is_ssi_eligible).toBeUndefined();
    }
  });

  it("sets individual expenses, total expenses and integer monthly attendance", () => {
    const s = createSituation("us", "CA", 20000, {}, 15000, [child("CA"), { age: 9 }], "2026", {}, 40, 40, {}, false, extras("CA"));
    expect(s.people.child_1.pre_subsidy_childcare_expenses[2026]).toBe(12000);
    expect(s.people.child_2.pre_subsidy_childcare_expenses[2026]).toBe(0);
    expect(s.spm_units["your spm_unit"].spm_unit_pre_subsidy_childcare_expenses[2026]).toBe(12000);
    expect(s.people.child_1.childcare_attending_days_per_month[2026]).toBe(22);
    expect(s.people.child_2.childcare_hours_per_day[2026]).toBe(0);
  });

  it("does not let missing provider choices fall back to a model default", () => {
    expect(() => createSituation("us", "MD", 20000, {}, 15000, [{ age: 3, childcareCost: 12000 }], "2026", {}, 40, 40, {}, false, extras("MD"))).toThrow("provider type");
  });

  it("keeps Nevada's explicit activity input out of other states", () => {
    for (const state of ["NV", "CA"]) {
      const s = createSituation("us", state, 20000, {}, 15000, [child(state)], "2026", {}, 40, 40, {}, false, { ...extras(state), childcareActivityEligible: true });
      expect(s.spm_units["your spm_unit"].meets_ccdf_activity_test).toEqual(state === "NV" ? { 2026: true } : undefined);
    }
  });

  it.each([["CA", 8000, 2000], ["FL", 2000, 2000]])("counts %s childcare once", (state, stateBenefits, expectedOther) => {
    const data = { child_care_subsidies: [6000], household_state_benefits: [stateBenefits],
      household_benefits: [stateBenefits + 1000], household_net_income: [30000],
      household_net_income_including_health_benefits: [35000], head_start: [20000], early_head_start: [0] };
    normalizeUSChildcare(data, state, 12000, {});
    expect(data.household_state_benefits[0]).toBe(expectedOther);
    expect(data.household_benefits[0]).toBe(9000);
    expect(data.household_net_income[0]).toBe(state === "CA" ? 18000 : 24000);
    expect(data.head_start[0]).toBe(0);
    expect(data.head_start_service_value[0]).toBe(20000);
    expect(data.childcare_out_of_pocket[0]).toBe(6000);
  });
});

describe("current runtime childcare regressions", () => {
  it("the disability checkbox enables SSI's medical test without bypassing earnings rules", async () => {
    const [without, disabled, highEarnings] = await Promise.all([
      getPrograms("us", "CA", 0, {}, null, [], "2026"),
      getPrograms("us", "CA", 0, { head: true }, null, [], "2026"),
      getPrograms("us", "CA", 30000, { head: true }, null, [], "2026"),
    ]);
    expect(without.benefits.ssi).toBe(0);
    expect(disabled.benefits.ssi).toBeGreaterThan(0);
    expect(highEarnings.benefits.ssi).toBe(0);
  }, 60000);

  it("preserves care expenses and location without a funded slot", async () => {
    const e = { ...extras("CA"), ccdfSlotAvailable: false };
    const s = createSituation("us", "CA", 20000, {}, 15000, [child("CA")], "2026", {}, 40, 40, {}, false, e);
    expect(s.households["your household"].county[2026]).toBe(e.childcareCounty);
    expect(s.people.child_1.pre_subsidy_childcare_expenses[2026]).toBe(12000);
    expect(s.spm_units["your spm_unit"].ca_child_care_subsidies[2026]).toBe(0);
    const r = await getPrograms("us", "CA", 20000, {}, 15000, [child("CA")], "2026", {}, 40, 40, {}, false, e);
    expect(r.childcare.subsidy).toBe(0);
    expect(r.childcare.grossCost).toBe(12000);
    expect(r.childcare.outOfPocket).toBe(12000);
    expect(r.aggregates.childcareCostDeducted).toBe(12000);
  }, 60000);

  it("matches the childcare grid and selected-cell results to scalar calculations", async () => {
    const e = { ...extras("CA"), includeHeadStart: true };
    const children = [child("CA")];
    const [results, grid] = await Promise.all([
      getCategorizedPrograms("us", "CA", 20000, 15000, children, {}, "2026", {}, 40, 40, {}, false, e),
      getHeatmapData("us", "CA", children, {}, "2026", {}, 20000, 15000, 40, 40, {}, false, e),
    ]);
    const cell = buildCellResults("us", grid.programData, 8, 6, grid.count, grid.stateCreditEntries, e);
    for (const scenario of ["married", "unmarried"]) {
      for (const [category, entries] of Object.entries(results[scenario])) {
        for (const [key, value] of Object.entries(entries)) {
          expect(Math.abs(cell[scenario][category][key] - value), `${scenario}.${category}.${key}`).toBeLessThan(0.05);
        }
      }
    }
    expect(Math.abs(grid.grids["net income"][6][8] - (results.married.aggregates.householdNetIncome - results.unmarried.aggregates.householdNetIncome))).toBeLessThan(0.05);
    expect(computeTableData(results, "summary").find(row => row.program === "Earnings").married).toBe("$35,000");
  }, 120000);

  it("keeps Head Start and Early Head Start family eligibility stable for cohabiting parents", async () => {
    for (const age of [2, 4]) {
      const r = await getCategorizedPrograms("us", "CA", 15000, 60000, [{ age }], {}, "2026", {}, 40, 40, {}, false, { livingArrangement: "cohabiting" });
      expect(r.married.childcare.headStartEligible).toBe(0);
      expect(r.unmarried.childcare.headStartEligible).toBe(0);
      expect(r.married.childcare.earlyHeadStartEligible).toBe(0);
      expect(r.unmarried.childcare.earlyHeadStartEligible).toBe(0);
    }
  }, 60000);

  it("keeps paid care with the parent when households are separate", async () => {
    const r = await getCategorizedPrograms("us", "CA", 20000, 15000, [child("CA")], {}, "2026", {}, 40, 40, {}, false, { ...extras("CA"), livingArrangement: "separate" });
    expect(r.headSingle.childcare.grossCost).toBe(12000);
    expect(r.spouseSingle.childcare.grossCost).toBe(0);
    expect(r.spouseSingle.childcare.subsidy).toBe(0);
    expect(r.married.childcare.grossCost).toBe(12000);
  }, 60000);

  it("does not pay Vermont's part-time rate for a sibling receiving no paid care", async () => {
    const e = extras("VT");
    const r = await getPrograms("us", "VT", 20000, {}, 15000, [child("VT"), { age: 3, childcareCost: 0 }], "2026", {}, 40, 40, {}, false, e);
    // The model pays its state rate even above a provider's entered charges.
    // This family has one participating child, not two subsidized places.
    expect(r.childcare.subsidy).toBeGreaterThan(12000);
    expect(r.childcare.subsidy).toBeLessThan(30000);
    expect(r.childcare.outOfPocket).toBe(0);
  }, 60000);
});
