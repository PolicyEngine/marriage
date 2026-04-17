/**
 * Integration tests for api.js — calls the live PolicyEngine API
 * and verifies that every metadata-driven variable is properly extracted,
 * breakdowns sum to aggregates, and the result shape is correct.
 *
 * Run: npm test
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getPrograms, getCategorizedPrograms, buildCellResults } from "../lib/api.js";
import metadata from "../lib/metadata.json";
import ukMetadata from "../lib/metadata-uk.json";

// Tolerance for floating-point aggregate vs sum-of-parts comparisons.
// The API returns rounded values; $2 covers any rounding.
const TOLERANCE = 2;

// ---------- helpers ----------

function allKeys(category) {
  return category.map((v) => v.variable);
}

function sumValues(dict) {
  return Object.values(dict).reduce((a, b) => a + (b || 0), 0);
}

function expectNumericDict(dict, expectedKeys, label) {
  for (const key of expectedKeys) {
    expect(dict, `${label}: missing key "${key}"`).toHaveProperty(key);
    expect(typeof dict[key], `${label}.${key} should be a number`).toBe("number");
  }
}

// ---------- Scenario 1: Married couple, CA, $45k/$45k, no children ----------

describe("Scenario 1: Married CA $45k/$45k no children", () => {
  let result;

  beforeAll(async () => {
    result = await getPrograms(
      "us",
      "CA",
      45000,
      { head: false, spouse: false },
      45000,  // spouse income
      [],     // no children
      "2026",
    );
  }, 60000);

  it("returns all 7 aggregate keys as numbers", () => {
    const agg = result.aggregates;
    expect(typeof agg.householdNetIncome).toBe("number");
    expect(typeof agg.householdNetIncomeWithHealth).toBe("number");
    expect(typeof agg.householdBenefits).toBe("number");
    expect(typeof agg.householdRefundableCredits).toBe("number");
    expect(typeof agg.householdTaxBeforeCredits).toBe("number");
    expect(typeof agg.healthcareBenefitValue).toBe("number");
    expect(typeof agg.householdRefundableStateCredits).toBe("number");
  });

  it("benefits dict has all metadata benefit keys", () => {
    expectNumericDict(result.benefits, allKeys(metadata.benefits), "benefits");
  });

  it("credits dict has all metadata credit keys", () => {
    expectNumericDict(result.credits, allKeys(metadata.credits), "credits");
  });

  it("taxes dict has all metadata tax keys", () => {
    expectNumericDict(result.taxes, allKeys(metadata.taxes), "taxes");
  });

  it("health dict has all metadata healthcare keys", () => {
    expectNumericDict(result.health, allKeys(metadata.healthcare), "health");
  });

  it("stateCredits dict has all metadata stateCredit keys", () => {
    expectNumericDict(result.stateCredits, allKeys(metadata.stateCredits), "stateCredits");
  });

  it("stateTaxes dict has all metadata stateTax keys", () => {
    expectNumericDict(result.stateTaxes, allKeys(metadata.stateTaxes), "stateTaxes");
  });

  it("benefits breakdown sums ≈ householdBenefits aggregate", () => {
    const sum = sumValues(result.benefits);
    const agg = result.aggregates.householdBenefits;
    expect(Math.abs(sum - agg)).toBeLessThan(
      Math.max(TOLERANCE, Math.abs(agg) * 0.01),
    );
  });

  it("federal + state credits sum ≈ householdRefundableCredits aggregate", () => {
    // household_refundable_tax_credits = federal credits + state refundable credits
    const sum = sumValues(result.credits) + (result.stateCredits.state_refundable_credits || 0);
    const agg = result.aggregates.householdRefundableCredits;
    expect(Math.abs(sum - agg)).toBeLessThan(
      Math.max(TOLERANCE, Math.abs(agg) * 0.01),
    );
  });

  it("health breakdown sums ≈ healthcareBenefitValue aggregate", () => {
    const sum = sumValues(result.health);
    const agg = result.aggregates.healthcareBenefitValue;
    expect(Math.abs(sum - agg)).toBeLessThan(
      Math.max(TOLERANCE, Math.abs(agg) * 0.01),
    );
  });

  it("net income = income + benefits + credits - taxes (rough check)", () => {
    const { householdNetIncome, householdBenefits, householdRefundableCredits, householdTaxBeforeCredits } = result.aggregates;
    const employmentIncome = 45000 + 45000;
    const computed = employmentIncome + householdBenefits + householdRefundableCredits - householdTaxBeforeCredits;
    // Allow 1% tolerance since there can be other income adjustments
    expect(Math.abs(computed - householdNetIncome)).toBeLessThan(
      Math.max(100, Math.abs(householdNetIncome) * 0.02),
    );
  });

  it("uses refundable_ctc not ctc", () => {
    expect(result.credits).toHaveProperty("refundable_ctc");
    expect(result.credits).not.toHaveProperty("ctc");
  });

  it("does not include cdcc (nonrefundable)", () => {
    expect(result.credits).not.toHaveProperty("cdcc");
  });

  it("uses medicaid_cost not medicaid", () => {
    expect(result.health).toHaveProperty("medicaid_cost");
    expect(result.health).not.toHaveProperty("medicaid");
  });

  it("uses aca_ptc not premium_tax_credit", () => {
    expect(result.health).toHaveProperty("aca_ptc");
    expect(result.health).not.toHaveProperty("premium_tax_credit");
  });

  it("uses employee_payroll_tax not employee_social_security_tax", () => {
    expect(result.taxes).toHaveProperty("employee_payroll_tax");
    expect(result.taxes).not.toHaveProperty("employee_social_security_tax");
    expect(result.taxes).not.toHaveProperty("employee_medicare_tax");
  });
});

// ---------- Scenario 2: Single head, CA, $20k, 1 child ----------

describe("Scenario 2: Single head CA $20k with 1 child (age 5)", () => {
  let result;

  beforeAll(async () => {
    result = await getPrograms(
      "us",
      "CA",
      20000,
      { head: false },
      null,   // no spouse
      [{ age: 5, isDisabled: false }],
      "2026",
    );
  }, 60000);

  it("returns all expected dict keys", () => {
    expectNumericDict(result.benefits, allKeys(metadata.benefits), "benefits");
    expectNumericDict(result.credits, allKeys(metadata.credits), "credits");
    expectNumericDict(result.taxes, allKeys(metadata.taxes), "taxes");
    expectNumericDict(result.health, allKeys(metadata.healthcare), "health");
  });

  it("EITC is non-zero for low-income single parent", () => {
    expect(result.credits.eitc).toBeGreaterThan(0);
  });

  it("refundable CTC is non-zero with a child", () => {
    expect(result.credits.refundable_ctc).toBeGreaterThan(0);
  });

  it("benefits breakdown sums ≈ aggregate", () => {
    const sum = sumValues(result.benefits);
    const agg = result.aggregates.householdBenefits;
    expect(Math.abs(sum - agg)).toBeLessThan(
      Math.max(TOLERANCE, Math.abs(agg) * 0.02),
    );
  });

  it("federal + state credits sum ≈ aggregate", () => {
    const sum = sumValues(result.credits) + (result.stateCredits.state_refundable_credits || 0);
    const agg = result.aggregates.householdRefundableCredits;
    expect(Math.abs(sum - agg)).toBeLessThan(
      Math.max(TOLERANCE, Math.abs(agg) * 0.02),
    );
  });
});

// ---------- Scenario 3: getCategorizedPrograms (married vs single) ----------

describe("Scenario 3: getCategorizedPrograms CA $50k/$30k", () => {
  let results;

  beforeAll(async () => {
    results = await getCategorizedPrograms(
      "us",
      "CA",
      50000,
      30000,
      [],
      { head: false, spouse: false },
      "2026",
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
      expect(r).toHaveProperty("credits");
      expect(r).toHaveProperty("taxes");
      expect(r).toHaveProperty("health");
      expect(r).toHaveProperty("stateCredits");
      expect(r).toHaveProperty("stateTaxes");
    }
  });

  it("married net income is a plausible value", () => {
    expect(results.married.aggregates.householdNetIncome).toBeGreaterThan(0);
    expect(results.married.aggregates.householdNetIncome).toBeLessThan(200000);
  });

  it("breakdowns sum ≈ aggregates for all 3 scenarios", () => {
    for (const key of ["married", "headSingle", "spouseSingle"]) {
      const r = results[key];

      const benefitSum = sumValues(r.benefits);
      expect(
        Math.abs(benefitSum - r.aggregates.householdBenefits),
        `${key} benefits mismatch`,
      ).toBeLessThan(Math.max(TOLERANCE, Math.abs(r.aggregates.householdBenefits) * 0.02));

      const creditSum = sumValues(r.credits) + (r.stateCredits.state_refundable_credits || 0);
      expect(
        Math.abs(creditSum - r.aggregates.householdRefundableCredits),
        `${key} credits mismatch`,
      ).toBeLessThan(Math.max(TOLERANCE, Math.abs(r.aggregates.householdRefundableCredits) * 0.02));

      const healthSum = sumValues(r.health);
      expect(
        Math.abs(healthSum - r.aggregates.healthcareBenefitValue),
        `${key} health mismatch`,
      ).toBeLessThan(Math.max(TOLERANCE, Math.abs(r.aggregates.healthcareBenefitValue) * 0.02));
    }
  });

  it("spouseSingle has no children (empty children passed)", () => {
    // spouse scenario gets no children; head scenario gets them
    // Both should still return valid data
    expect(typeof results.spouseSingle.aggregates.householdNetIncome).toBe("number");
  });
});

// ---------- Scenario 4: buildCellResults shape ----------

describe("buildCellResults returns correct shape", () => {
  it("builds dicts with all metadata keys from mock programData", () => {
    // Create minimal mock programData with all expected variable names
    const programData = {};
    const allEntries = [
      ...metadata.benefits,
      ...metadata.credits,
      ...metadata.taxes,
      ...metadata.healthcare,
      ...metadata.stateCredits,
      ...metadata.stateTaxes,
      ...metadata.aggregates,
    ];
    for (const entry of allEntries) {
      programData[entry.variable] = {
        married: [100, 200, 300, 400],
        head: [50, 60],
        spouse: [50, 60],
      };
    }

    const count = 2;
    const cell = buildCellResults("us", programData, 0, 1, count);

    expect(cell).toHaveProperty("married");
    expect(cell).toHaveProperty("headSingle");
    expect(cell).toHaveProperty("spouseSingle");

    // Verify all categories are present
    for (const scenario of ["married", "headSingle", "spouseSingle"]) {
      const r = cell[scenario];
      expect(r).toHaveProperty("aggregates");
      expect(r).toHaveProperty("benefits");
      expect(r).toHaveProperty("credits");
      expect(r).toHaveProperty("taxes");
      expect(r).toHaveProperty("health");
      expect(r).toHaveProperty("stateCredits");
      expect(r).toHaveProperty("stateTaxes");

      // Verify keys match metadata
      expect(Object.keys(r.benefits).sort()).toEqual(allKeys(metadata.benefits).sort());
      expect(Object.keys(r.credits).sort()).toEqual(allKeys(metadata.credits).sort());
      expect(Object.keys(r.taxes).sort()).toEqual(allKeys(metadata.taxes).sort());
      expect(Object.keys(r.health).sort()).toEqual(allKeys(metadata.healthcare).sort());
      expect(Object.keys(r.stateCredits).sort()).toEqual(allKeys(metadata.stateCredits).sort());
      expect(Object.keys(r.stateTaxes).sort()).toEqual(allKeys(metadata.stateTaxes).sort());
    }

    // married scenario: index = headIdx * count + spouseIdx = 0 * 2 + 1 = 1
    expect(cell.married.benefits[metadata.benefits[0].variable]).toBe(200);
    // head scenario: headIdx = 0
    expect(cell.headSingle.benefits[metadata.benefits[0].variable]).toBe(50);
    // spouse scenario: spouseIdx = 1
    expect(cell.spouseSingle.benefits[metadata.benefits[0].variable]).toBe(60);
  });
});

// ---------- Scenario 5: Low income to trigger more benefits ----------

describe("Scenario 5: Low-income single CA $10k to trigger benefits", () => {
  let result;

  beforeAll(async () => {
    result = await getPrograms(
      "us",
      "CA",
      10000,
      { head: false },
      null,
      [{ age: 3, isDisabled: false }],
      "2026",
    );
  }, 60000);

  it("SNAP is non-zero at very low income with child", () => {
    expect(result.benefits.snap).toBeGreaterThan(0);
  });

  it("medicaid_cost is non-zero for low-income household", () => {
    expect(result.health.medicaid_cost).toBeGreaterThan(0);
  });

  it("all benefit keys are numbers (no undefined/NaN)", () => {
    for (const key of allKeys(metadata.benefits)) {
      const val = result.benefits[key];
      expect(typeof val).toBe("number");
      expect(Number.isNaN(val)).toBe(false);
    }
  });

  it("all tax keys are numbers (no undefined/NaN)", () => {
    for (const key of allKeys(metadata.taxes)) {
      const val = result.taxes[key];
      expect(typeof val).toBe("number");
      expect(Number.isNaN(val)).toBe(false);
    }
  });

  it("taxes breakdown sums ≈ householdTaxBeforeCredits aggregate", () => {
    // taxes dict includes household_state_tax_before_refundable_credits
    // plus stateTaxes has state_income_tax_before_refundable_credits
    // But only taxes is used in the aggregate comparison
    const sum = sumValues(result.taxes);
    const agg = result.aggregates.householdTaxBeforeCredits;
    expect(Math.abs(sum - agg)).toBeLessThan(
      Math.max(TOLERANCE, Math.abs(agg) * 0.02),
    );
  });
});

// ==========================================================================
// UK TESTS
// ==========================================================================

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
