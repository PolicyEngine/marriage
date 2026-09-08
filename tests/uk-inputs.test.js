/**
 * UK Universal Credit input tests.
 *
 * Entity placement is load-bearing: the PolicyEngine API rejects `rent` on a
 * person and `childcare_expenses` on a household, so these assert where each
 * variable lands as well as that it lands at all.
 */

import { describe, it, expect } from "vitest";
import {
  createSituation, splitExtras, isRentedTenure,
  UK_EXTRAS_DEFAULTS,
} from "../lib/api.js";
import { COUNTRIES, DEFAULT_COUNTRY } from "../lib/countries.js";
import { formatYearLabel } from "../lib/utils.js";

const Y = "2025";
const kids = [{ age: 5 }, { age: 8 }];

function uk(extras = {}, spouseIncome = 15000, children = kids) {
  return createSituation(
    "uk", "ENGLAND", 15000, { head: false, spouse: false },
    spouseIncome, children, Y, {}, 35, 35, {}, false, extras,
  );
}

describe("UK situation: entity placement", () => {
  const s = uk({
    rent: 12000, tenureType: "RENT_FROM_COUNCIL", savings: 20000,
    childcareCosts: 6000,
    carerStatus: { head: true },
    selfEmploymentIncome: { head: 5000, spouse: 1000 },
    pensionIncome: { spouse: 2000 },
  });
  const hh = s.households["your household"];

  it("puts rent, tenure and savings on the household", () => {
    expect(hh.rent[Y]).toBe(12000);
    expect(hh.tenure_type[Y]).toBe("RENT_FROM_COUNCIL");
    expect(hh.savings[Y]).toBe(20000);
  });

  it("never puts rent on a person", () => {
    for (const person of Object.values(s.people)) {
      expect(person).not.toHaveProperty("rent");
    }
  });

  it("puts childcare costs on children, split evenly, not on the household", () => {
    expect(hh).not.toHaveProperty("childcare_expenses");
    expect(s.people.child_1.childcare_expenses[Y]).toBe(3000);
    expect(s.people.child_2.childcare_expenses[Y]).toBe(3000);
  });

  it("puts carer, self-employment and pension on the right adults", () => {
    expect(s.people.you.is_carer_for_benefits[Y]).toBe(true);
    expect(s.people["your partner"].is_carer_for_benefits[Y]).toBe(false);
    expect(s.people.you.self_employment_income[Y]).toBe(5000);
    expect(s.people["your partner"].self_employment_income[Y]).toBe(1000);
    expect(s.people["your partner"].private_pension_income[Y]).toBe(2000);
  });

  it("passes disability through, which the UK builder used to drop", () => {
    const d = createSituation(
      "uk", "ENGLAND", 15000, { head: true, spouse: false },
      15000, kids, Y, {}, 35, 35, {}, false, {},
    );
    expect(d.people.you.is_disabled_for_benefits[Y]).toBe(true);
    expect(d.people["your partner"].is_disabled_for_benefits[Y]).toBe(false);
  });

  it("omits childcare when there are no children", () => {
    const s2 = uk({ childcareCosts: 6000 }, null, []);
    for (const person of Object.values(s2.people)) {
      expect(person).not.toHaveProperty("childcare_expenses");
    }
  });
});

describe("splitExtras: allocation when the couple separates", () => {
  const extras = {
    rent: 12000, savings: 20000, childcareCosts: 6000,
    carerStatus: { head: true, spouse: false },
    selfEmploymentIncome: { head: 5000, spouse: 1000 },
    pensionIncome: { head: 0, spouse: 2000 },
  };

  it("charges each separate household the rent entered", () => {
    expect(splitExtras(extras, "head").rent).toBe(12000);
    expect(splitExtras(extras, "spouse").rent).toBe(12000);
  });

  it("splits savings evenly, which can put both sides under the capital limit", () => {
    expect(splitExtras(extras, "head").savings).toBe(10000);
    expect(splitExtras(extras, "spouse").savings).toBe(10000);
  });

  it("keeps childcare with the children, who go to the head", () => {
    expect(splitExtras(extras, "head").childcareCosts).toBe(6000);
    expect(splitExtras(extras, "spouse", { childcareCosts: 0 }).childcareCosts).toBe(0);
  });

  it("gives each adult their own carer, self-employment and pension values", () => {
    const h = splitExtras(extras, "head");
    const sp = splitExtras(extras, "spouse");
    expect(h.carerStatus).toEqual({ head: true });
    expect(sp.carerStatus).toEqual({ head: false });
    expect(h.selfEmploymentIncome).toEqual({ head: 5000 });
    expect(sp.selfEmploymentIncome).toEqual({ head: 1000 });
    expect(h.pensionIncome).toEqual({ head: 0 });
    expect(sp.pensionIncome).toEqual({ head: 2000 });
  });

  it("fills defaults when given nothing", () => {
    expect(splitExtras({}, "head").tenureType).toBe(UK_EXTRAS_DEFAULTS.tenureType);
  });
});

describe("UK config", () => {
  it("enables the Universal Credit inputs", () => {
    const c = COUNTRIES.uk;
    expect(c.hasDisability).toBe(true);
    expect(c.hasHousing).toBe(true);
    expect(c.hasChildcare).toBe(true);
    expect(c.hasCarer).toBe(true);
    expect(c.hasCapital).toBe(true);
    expect(c.hasSelfEmployment).toBe(true);
    expect(c.hasPensionIncome).toBe(true);
  });

  it("marks only net income for rent deduction in the heatmap", () => {
    const withRent = COUNTRIES.uk.gridConfig.filter((g) => g.deductRent);
    expect(withRent).toHaveLength(1);
    expect(withRent[0].variable).toBe("household_net_income");
  });

  it("leaves the US config untouched", () => {
    expect(COUNTRIES.us.hasHousing).toBeUndefined();
    expect(COUNTRIES.us.gridConfig.some((g) => g.deductRent)).toBe(false);
  });
});

describe("tenure: owners have no rent to deduct", () => {

  it("treats the three rented tenures as renting", () => {
    expect(isRentedTenure("RENT_PRIVATELY")).toBe(true);
    expect(isRentedTenure("RENT_FROM_COUNCIL")).toBe(true);
    expect(isRentedTenure("RENT_FROM_HA")).toBe(true);
  });

  it("treats owned tenures as not renting", () => {
    expect(isRentedTenure("OWNED_OUTRIGHT")).toBe(false);
    expect(isRentedTenure("OWNED_WITH_MORTGAGE")).toBe(false);
  });


});

describe("UK years", () => {
  it("defaults to 2026-27", () => {
    expect(COUNTRIES.uk.defaultYear).toBe("2026");
  });

  it("offers the three years after the default", () => {
    for (const y of ["2027", "2028", "2029"]) {
      expect(COUNTRIES.uk.availableYears).toContain(y);
    }
  });

  it("leaves the US year range alone", () => {
    expect(COUNTRIES.us.availableYears).not.toContain("2029");
  });

  it("drops the past years on both countries", () => {
    for (const c of [COUNTRIES.uk, COUNTRIES.us]) {
      expect(c.availableYears).not.toContain("2024");
      expect(c.availableYears).not.toContain("2025");
      expect(c.availableYears[0]).toBe("2026");
    }
  });

  it("leads with the UK in the toggle", () => {
    expect(Object.keys(COUNTRIES)[0]).toBe("uk");
  });

  it("still falls back to the US, which the /us/marriage rewrite relies on", () => {
    // That route sends no ?country=, so it resolves through this fallback.
    // Pointing it at the UK would serve the UK calculator on the US page.
    expect(DEFAULT_COUNTRY).toBe("us");
  });
});

describe("year labels", () => {
  it("renders US calendar years and UK tax-year spans", () => {
    expect(formatYearLabel("2026", "us")).toBe("2026");
    expect(formatYearLabel("2026")).toBe("2026");
    expect(formatYearLabel("2026", "uk")).toBe("2026-27");
    expect(formatYearLabel("2027", "uk")).toBe("2027-28");
    expect(formatYearLabel("2029", "uk")).toBe("2029-30");
  });

  it("pads the century rollover rather than showing a single digit", () => {
    expect(formatYearLabel("2099", "uk")).toBe("2099-00");
  });

  it("passes through anything that is not a year", () => {
    expect(formatYearLabel("")).toBe("");
    expect(formatYearLabel("abc")).toBe("abc");
  });

  it("covers every year both countries offer", () => {
    for (const c of [COUNTRIES.uk, COUNTRIES.us]) {
      for (const y of c.availableYears) {
        expect(formatYearLabel(y, c.id)).toMatch(c.id === "uk" ? /^\d{4}-\d{2}$/ : /^\d{4}$/);
      }
    }
  });
});
