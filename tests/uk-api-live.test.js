/** Optional external UK API integration checks: bun run test:live:uk */
import { describe, it, expect, beforeAll } from "vitest";
import { getPrograms, getCategorizedPrograms } from "../lib/api.js";
import ukMetadata from "../lib/metadata-uk.json";

function allKeys(category) {
  return category.map((value) => value.variable);
}
function expectNumericDict(dict, expectedKeys, label) {
  for (const key of expectedKeys) {
    expect(dict, `${label}: missing key "${key}"`).toHaveProperty(key);
    expect(typeof dict[key], `${label}.${key} should be a number`).toBe("number");
  }
}

// ---------- UK Scenario 1: Married couple, England, £30k/£30k ----------

describe("UK Scenario 1: Married England £30k/£30k no children", () => {
  let result;

  beforeAll(async () => {
    result = await getPrograms(
      "uk",
      "ENGLAND",
      30000,
      { head: false, spouse: false },
      30000,
      [],
      "2025",
    );
  }, 60000);

  it("returns all aggregate keys as numbers", () => {
    const agg = result.aggregates;
    expect(typeof agg.householdNetIncome).toBe("number");
    expect(typeof agg.householdBenefits).toBe("number");
    expect(typeof agg.householdTaxBeforeCredits).toBe("number");
  });

  it("benefits dict has all UK metadata benefit keys", () => {
    expectNumericDict(result.benefits, allKeys(ukMetadata.benefits), "benefits");
  });

  it("taxes dict has all UK metadata tax keys", () => {
    expectNumericDict(result.taxes, allKeys(ukMetadata.taxes), "taxes");
  });

  it("net income is positive and plausible", () => {
    expect(result.aggregates.householdNetIncome).toBeGreaterThan(0);
    expect(result.aggregates.householdNetIncome).toBeLessThan(100000);
  });
});

// ---------- UK Scenario 2: getCategorizedPrograms England £40k/£20k ----------

describe("UK Scenario 2: getCategorizedPrograms England £40k/£20k", () => {
  let results;

  beforeAll(async () => {
    results = await getCategorizedPrograms(
      "uk",
      "ENGLAND",
      40000,
      20000,
      [],
      { head: false, spouse: false },
      "2025",
    );
  }, 120000);

  it("returns married, headSingle, spouseSingle", () => {
    expect(results).toHaveProperty("married");
    expect(results).toHaveProperty("headSingle");
    expect(results).toHaveProperty("spouseSingle");
  });

  it("all three scenarios have complete shapes", () => {
    for (const key of ["married", "headSingle", "spouseSingle"]) {
      const r = results[key];
      expect(r).toHaveProperty("aggregates");
      expect(r).toHaveProperty("benefits");
      expect(r).toHaveProperty("taxes");
    }
  });

  it("married net income is a plausible value", () => {
    expect(results.married.aggregates.householdNetIncome).toBeGreaterThan(0);
    expect(results.married.aggregates.householdNetIncome).toBeLessThan(100000);
  });
});

// ---------- UK Scenario 3: Low income with child to trigger child benefit ----------

describe("UK Scenario 3: Single England £15k with 1 child (age 5)", () => {
  let result;

  beforeAll(async () => {
    result = await getPrograms(
      "uk",
      "ENGLAND",
      15000,
      { head: false },
      null,
      [{ age: 5, isDisabled: false }],
      "2025",
    );
  }, 60000);

  it("returns all UK benefit keys as numbers", () => {
    expectNumericDict(result.benefits, allKeys(ukMetadata.benefits), "benefits");
  });

  it("child_benefit is non-zero with a child", () => {
    expect(result.benefits.child_benefit).toBeGreaterThan(0);
  });

  it("universal_credit is non-zero at low income with child", () => {
    expect(result.benefits.universal_credit).toBeGreaterThan(0);
  });
});
