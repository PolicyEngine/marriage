import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrograms } from "../lib/api";
import metadata from "../lib/metadata.json";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function responseFor(body) {
  const situation = JSON.parse(body).household;
  const series = {};
  for (const [plural, entities] of Object.entries(situation)) {
    if (plural === "axes") continue;
    for (const entity of Object.values(entities)) {
      for (const [variable, periods] of Object.entries(entity)) {
        if (periods?.[2026] === null) series[variable] = [0];
      }
    }
  }
  return {model_version: metadata.modelVersion, result: situation, accounting: {
    version: 1, axis_order: "first_axis_fastest", series: { ...series,
      household_net_income: [32123], household_net_income_including_health_benefits: [36123],
      financial_resources: [32123], healthcare_benefit_value: [4000], healthcare_service_value: [4000],
      early_education_service_value: [5000], combined_resources: [41123],
      household_market_income: [40000], household_health_costs: [0],
      childcare_family_share: [0], head_start_service_value: [5000], early_head_start_service_value: [0],
      childcare_gross_cost: [10000], childcare_cost_deducted: [10000], childcare_out_of_pocket: [2000],
      child_care_subsidies: [8000], childcare_provider_payment: [11000], household_benefits: [9000],
    },
  }};
}
const calculate = extras => getPrograms("us", "CA", 25000, {}, 15000, [], "2026", {}, 40, 40, {}, false, extras);

describe("backend accounting contract", () => {
  it("renders authoritative resources without recalculating them from form costs or inclusion flags", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      expect(JSON.parse(options.body).accounting_version).toBe(1);
      expect(JSON.parse(options.body)).not.toHaveProperty("include_head_start_benefits");
      return {ok: true, json: async () => responseFor(options.body)};
    }));
    const result = await calculate({includeHeadStart: true});
    expect(result.aggregates.financialResources).toBe(32123);
    expect(result.aggregates.householdNetIncome).toBe(32123);
    expect(result.aggregates.combinedResources).toBe(41123);
    expect(result.childcare.outOfPocket).toBe(2000);
    expect(result.childcare.subsidy).toBe(8000);
    expect(result.childcare.providerPayment).toBe(11000);
  });

  it.each(["snap", "childcare_out_of_pocket", "childcare_cost_deducted", "household_market_income"])("rejects missing %s instead of silently displaying zero", async (variable) => {
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      const response = responseFor(options.body);
      delete response.accounting.series[variable];
      return {ok: true, json: async () => response};
    }));
    await expect(calculate()).rejects.toThrow("incomplete results");
  });

  it("aborts a superseded request", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const pending = calculate({signal: controller.signal});
    controller.abort();
    await expect(pending).rejects.toMatchObject({name: "AbortError"});
  });

  it("gives an actionable error when the service times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const pending = expect(calculate()).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(120000);
    await pending;
  });
});
