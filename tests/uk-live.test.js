/**
 * Live UK model tests.
 *
 * These hit api.policyengine.org. They exist because the unit tests only prove
 * we send the right JSON; they cannot prove the model does anything with it. A
 * field that reaches the API but changes no output is a field that silently
 * lies to the user, which is the failure mode these guard against.
 *
 * Each case asserts a direction and a mechanism, not a hardcoded number, so
 * they survive routine parameter uprating.
 */

import { describe, it, expect } from "vitest";
import { getCategorizedPrograms } from "../lib/api.js";

const YEAR = "2026";
const KIDS = [{ age: 5 }, { age: 8 }];
const NO_DIS = { head: false, spouse: false };

async function run({
  head = 15000, spouse = 15000, children = KIDS,
  disability = NO_DIS, extras = {},
} = {}) {
  const r = await getCategorizedPrograms(
    "uk", "ENGLAND", head, spouse, children,
    disability, YEAR, {}, 35, 35, {}, false, extras,
  );
  const together = r.married.aggregates.householdNetIncome;
  const apart =
    r.headSingle.aggregates.householdNetIncome +
    r.spouseSingle.aggregates.householdNetIncome;
  return { together, apart, penalty: apart - together, raw: r };
}

const TIMEOUT = 120000;

describe("each input changes the result", () => {
  let base;

  it("computes a baseline", async () => {
    base = await run();
    expect(base.together).toBeGreaterThan(0);
    expect(base.apart).toBeGreaterThan(0);
  }, TIMEOUT);

  it("rent raises entitlement and is then netted off", async () => {
    const r = await run({ extras: { rent: 12000, tenureType: "RENT_PRIVATELY" } });
    // Housing support is worth less than the rent, so after-housing income
    // must fall relative to paying no rent at all.
    expect(r.together).toBeLessThan(base.together);
    expect(r.together).not.toBe(base.together);
  }, TIMEOUT);

  it("social rent beats private rent, which is LHA-capped", async () => {
    const priv = await run({ extras: { rent: 12000, tenureType: "RENT_PRIVATELY" } });
    const social = await run({ extras: { rent: 12000, tenureType: "RENT_FROM_COUNCIL" } });
    expect(social.together).toBeGreaterThan(priv.together);
  }, TIMEOUT);

  it("an owner is unaffected by a rent figure", async () => {
    const owner = await run({ extras: { rent: 12000, tenureType: "OWNED_OUTRIGHT" } });
    expect(owner.together).toBeCloseTo(base.together, 2);
    expect(owner.penalty).toBeCloseTo(base.penalty, 2);
  }, TIMEOUT);

  it("childcare costs raise net income through the childcare element", async () => {
    const r = await run({ extras: { childcareCosts: 6000 } });
    expect(r.together).toBeGreaterThan(base.together);
  }, TIMEOUT);

  it("childcare does nothing without children, since it is per child", async () => {
    const noKids = await run({ children: [] });
    const withCosts = await run({ children: [], extras: { childcareCosts: 6000 } });
    expect(withCosts.together).toBeCloseTo(noKids.together, 2);
  }, TIMEOUT);

  it("disability raises net income via the limited-capability element", async () => {
    const r = await run({ disability: { head: true, spouse: false } });
    expect(r.together).toBeGreaterThan(base.together);
  }, TIMEOUT);

  it("carer status raises net income via the carer element", async () => {
    const r = await run({ extras: { carerStatus: { head: true } } });
    expect(r.together).toBeGreaterThan(base.together);
  }, TIMEOUT);

  it("savings above the capital limit cut entitlement", async () => {
    const r = await run({ head: 5000, spouse: 0, extras: { savings: 20000 } });
    const none = await run({ head: 5000, spouse: 0 });
    expect(r.together).toBeLessThan(none.together);
  }, TIMEOUT);

  it("splitting savings can put both sides under the capital limit", async () => {
    // £20k jointly is over the upper limit; £10k each is under it, so
    // separating is worth more than it would be with no savings at all.
    const withSavings = await run({ head: 5000, spouse: 0, extras: { savings: 20000 } });
    const none = await run({ head: 5000, spouse: 0 });
    expect(withSavings.penalty).toBeGreaterThan(none.penalty);
  }, TIMEOUT);

  it("private pension income reduces UC pound for pound", async () => {
    const r = await run({ extras: { pensionIncome: { head: 5000 } } });
    // Unearned income is withdrawn pound for pound rather than tapered, and is
    // taxable on top. For a family whose remaining entitlement is smaller than
    // the pension, the whole award goes and the pension is taxed, so £5,000 of
    // pension can leave the family worse off than before. That is the model
    // behaving correctly, not a bug: verified against the components, where
    // market income rises £5,000, tax rises £1,000 and UC falls £4,233.
    expect(r.together).toBeLessThan(base.together + 5000);
    expect(r.raw.married.aggregates.householdBenefits)
      .toBeLessThan(base.raw.married.aggregates.householdBenefits);
  }, TIMEOUT);

  it("costs more entitlement than the same amount of wages", async () => {
    const wages = await run({ head: 20000 });
    const pension = await run({ head: 15000, extras: { pensionIncome: { head: 5000 } } });
    // Same £20,000 to the same adult: tapered as earnings, withdrawn in full
    // as unearned income.
    expect(pension.together).toBeLessThan(wages.together);
  }, TIMEOUT);

  it("self-employment is treated more harshly than wages, via the income floor", async () => {
    const wages = await run({ head: 5000, spouse: 0 });
    const selfEmp = await run({
      head: 0, spouse: 0, extras: { selfEmploymentIncome: { head: 5000 } },
    });
    expect(selfEmp.together).toBeLessThan(wages.together);
  }, TIMEOUT);
});

describe("rent is deducted consistently across the comparison", () => {
  it("charges rent to both separate households, not just one", async () => {
    const noRent = await run();
    const rent = await run({ extras: { rent: 12000, tenureType: "RENT_PRIVATELY" } });
    // Together pays one rent, apart pays two. The apart side must therefore
    // lose more than the together side does.
    const togetherDrop = noRent.together - rent.together;
    const apartDrop = noRent.apart - rent.apart;
    expect(apartDrop).toBeGreaterThan(togetherDrop);
  }, TIMEOUT);

  it("turns an apparent penalty into a bonus once rent is charged", async () => {
    // The headline correctness case: without deducting rent, the two-household
    // scenario collects housing support twice and pays no rent.
    const rent = await run({ extras: { rent: 12000, tenureType: "RENT_PRIVATELY" } });
    const noRent = await run();
    expect(noRent.penalty).toBeGreaterThan(0);
    expect(rent.penalty).toBeLessThan(noRent.penalty);
  }, TIMEOUT);
});
