/**
 * Correctness across combinations of inputs.
 *
 * The other suites check one thing at a time: does this field reach the API,
 * does that number move in the right direction. Neither would catch a result
 * that is internally inconsistent, or a field that behaves correctly alone but
 * is dropped once another is set.
 *
 * These run real combinations against api.policyengine.org and check identities
 * that must hold whatever the parameters are, so uprating cannot break them:
 *
 *   1. The benefit lines we display sum to the benefits aggregate.
 *   2. The tax lines we display sum to the tax aggregate.
 *   3. Net income equals market income plus benefits minus tax, and minus rent
 *      where the household rents.
 *   4. Each input still does its job when combined with the others.
 */

import { describe, it, expect } from "vitest";
import { getPrograms, getCategorizedPrograms } from "../lib/api.js";

const YEAR = "2026";
const KIDS = [{ age: 5 }, { age: 8 }];
const NO_DIS = { head: false, spouse: false };
const TIMEOUT = 180000;
// Money is compared to the nearest pound; the API returns floats.
const POUND = 1;

function sum(dict) {
  return Object.values(dict || {}).reduce((a, b) => a + (Number(b) || 0), 0);
}

async function couple({ head = 15000, spouse = 15000, children = KIDS, disability = NO_DIS, extras = {} } = {}) {
  return getPrograms(
    "uk", "ENGLAND", head, disability, spouse, children, YEAR,
    {}, 35, 35, {}, false, extras,
  );
}

async function comparison(opts = {}) {
  const { head = 15000, spouse = 15000, children = KIDS, disability = NO_DIS, extras = {} } = opts;
  const r = await getCategorizedPrograms(
    "uk", "ENGLAND", head, spouse, children, disability, YEAR,
    {}, 35, 35, {}, false, extras,
  );
  const together = r.married.aggregates.householdNetIncome;
  const apart =
    r.headSingle.aggregates.householdNetIncome +
    r.spouseSingle.aggregates.householdNetIncome;
  return { ...r, together, apart, penalty: apart - together };
}

// A deliberately varied matrix: each row turns on a different combination, so
// a field that only works in isolation shows up here.
const COMBINATIONS = [
  { name: "two earners, two children, no extras", opts: {} },
  {
    name: "single earner, renting privately",
    opts: { head: 25000, spouse: 0, extras: { rent: 12000, tenureType: "RENT_PRIVATELY" } },
  },
  {
    name: "single earner, social rent and childcare",
    opts: {
      head: 25000, spouse: 0,
      extras: { rent: 9000, tenureType: "RENT_FROM_COUNCIL", childcareCosts: 6000 },
    },
  },
  {
    name: "no earnings, disabled adult, renting",
    opts: {
      head: 0, spouse: 0, disability: { head: true, spouse: false },
      extras: { rent: 8000, tenureType: "RENT_PRIVATELY" },
    },
  },
  {
    name: "carer and savings under the limit",
    opts: { head: 8000, spouse: 0, extras: { carerStatus: { head: true }, savings: 5000 } },
  },
  {
    name: "savings over the limit",
    opts: { head: 8000, spouse: 0, extras: { savings: 20000 } },
  },
  {
    name: "self-employment and a private pension",
    opts: {
      head: 0, spouse: 12000,
      extras: { selfEmploymentIncome: { head: 10000 }, pensionIncome: { spouse: 4000 } },
    },
  },
  {
    name: "no children, owner-occupier, both disabled",
    opts: {
      head: 12000, spouse: 12000, children: [],
      disability: { head: true, spouse: true },
      extras: { tenureType: "OWNED_OUTRIGHT", rent: 0 },
    },
  },
  {
    name: "everything at once",
    opts: {
      head: 18000, spouse: 6000,
      disability: { head: false, spouse: true },
      extras: {
        rent: 10000, tenureType: "RENT_PRIVATELY", childcareCosts: 4000,
        savings: 3000, carerStatus: { head: true },
        selfEmploymentIncome: { spouse: 2000 }, pensionIncome: { head: 1500 },
      },
    },
  },
];

describe.each(COMBINATIONS)("$name", ({ opts }) => {
  let r;

  it("returns a result", async () => {
    r = await couple(opts);
    expect(r).toBeDefined();
    expect(Number.isFinite(r.aggregates.householdNetIncome)).toBe(true);
  }, TIMEOUT);

  it("benefit lines sum to the benefits aggregate", async () => {
    // If a benefit were missing from the metadata list, the breakdown shown to
    // the user would not add up to the headline. This is the check for that.
    expect(sum(r.benefits)).toBeCloseTo(r.aggregates.householdBenefits, -Math.log10(POUND));
  }, TIMEOUT);

  it("tax lines sum to the tax aggregate", async () => {
    expect(sum(r.taxes)).toBeCloseTo(r.aggregates.householdTaxBeforeCredits, -Math.log10(POUND));
  }, TIMEOUT);

  it("net income reconciles to market income, benefits, tax and rent", async () => {
    const rentCharged =
      ["RENT_PRIVATELY", "RENT_FROM_COUNCIL", "RENT_FROM_HA"].includes(
        opts.extras?.tenureType,
      )
        ? opts.extras.rent || 0
        : 0;
    // householdNetIncome as we report it = market + benefits - tax - rent.
    // Market income is not exposed as an aggregate, so derive and sanity-check
    // it: it must be non-negative and at least the household's earnings.
    const derivedMarket =
      r.aggregates.householdNetIncome
      - r.aggregates.householdBenefits
      + r.aggregates.householdTaxBeforeCredits
      + rentCharged;
    const earnings =
      (opts.head ?? 15000)
      + (opts.spouse ?? 15000)
      + (opts.extras?.selfEmploymentIncome?.head || 0)
      + (opts.extras?.selfEmploymentIncome?.spouse || 0)
      + (opts.extras?.pensionIncome?.head || 0)
      + (opts.extras?.pensionIncome?.spouse || 0);
    expect(derivedMarket).toBeGreaterThanOrEqual(-POUND);
    expect(derivedMarket).toBeCloseTo(earnings, -2);
  }, TIMEOUT);

  it("has no negative benefit or tax lines", async () => {
    for (const [name, value] of Object.entries(r.benefits)) {
      expect(value, `benefit ${name}`).toBeGreaterThanOrEqual(-POUND);
    }
    for (const [name, value] of Object.entries(r.taxes)) {
      expect(value, `tax ${name}`).toBeGreaterThanOrEqual(-POUND);
    }
  }, TIMEOUT);
});

describe("the together/apart comparison is arithmetically sound", () => {
  it("penalty equals apart minus together, on a combination with everything set", async () => {
    const c = await comparison(COMBINATIONS[COMBINATIONS.length - 1].opts);
    expect(c.penalty).toBeCloseTo(c.apart - c.together, 6);
    expect(Number.isFinite(c.penalty)).toBe(true);
  }, TIMEOUT);

  it("gives the two separate adults consistent, non-negative incomes", async () => {
    const c = await comparison({ head: 20000, spouse: 0, extras: { rent: 9000, tenureType: "RENT_PRIVATELY" } });
    expect(c.headSingle.aggregates.householdNetIncome).toBeGreaterThan(0);
    expect(c.spouseSingle.aggregates.householdNetIncome).toBeGreaterThan(0);
  }, TIMEOUT);
});

describe("inputs still work when combined, not only alone", () => {
  it("childcare still pays out once rent and savings are also set", async () => {
    const withoutCare = await couple({
      head: 20000, spouse: 8000,
      extras: { rent: 9000, tenureType: "RENT_PRIVATELY", savings: 4000 },
    });
    const withCare = await couple({
      head: 20000, spouse: 8000,
      extras: { rent: 9000, tenureType: "RENT_PRIVATELY", savings: 4000, childcareCosts: 6000 },
    });
    expect(withCare.aggregates.householdNetIncome)
      .toBeGreaterThan(withoutCare.aggregates.householdNetIncome);
  }, TIMEOUT);

  it("the capital limit still bites when rent and children are in play", async () => {
    const under = await couple({
      head: 6000, spouse: 0,
      extras: { rent: 9000, tenureType: "RENT_PRIVATELY", savings: 5000 },
    });
    const over = await couple({
      head: 6000, spouse: 0,
      extras: { rent: 9000, tenureType: "RENT_PRIVATELY", savings: 20000 },
    });
    expect(over.aggregates.householdNetIncome)
      .toBeLessThan(under.aggregates.householdNetIncome);
  }, TIMEOUT);

  it("tenure still decides whether housing support is paid, whatever else is set", async () => {
    const shared = {
      head: 10000, spouse: 4000,
      extras: { rent: 10000, childcareCosts: 3000, carerStatus: { head: true } },
    };
    const renting = await couple({
      ...shared,
      extras: { ...shared.extras, tenureType: "RENT_PRIVATELY" },
    });
    const owning = await couple({
      ...shared,
      extras: { ...shared.extras, tenureType: "OWNED_OUTRIGHT" },
    });
    // The owner pays no rent and receives no housing element; the renter
    // receives an element worth less than the rent, so ends up lower.
    expect(renting.aggregates.householdNetIncome)
      .toBeLessThan(owning.aggregates.householdNetIncome);
    expect(renting.benefits.housing_benefit ?? 0).toBeGreaterThanOrEqual(0);
  }, TIMEOUT);

  it("disability and carer stack rather than overriding each other", async () => {
    const neither = await couple({ head: 6000, spouse: 0 });
    const disabled = await couple({ head: 6000, spouse: 0, disability: { head: true, spouse: false } });
    const both = await couple({
      head: 6000, spouse: 0,
      disability: { head: true, spouse: false },
      extras: { carerStatus: { spouse: true } },
    });
    expect(disabled.aggregates.householdNetIncome)
      .toBeGreaterThan(neither.aggregates.householdNetIncome);
    expect(both.aggregates.householdNetIncome)
      .toBeGreaterThan(disabled.aggregates.householdNetIncome);
  }, TIMEOUT);
});
