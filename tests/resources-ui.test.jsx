/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ResultsDisplay from "../app/components/ResultsDisplay.jsx";
import { COUNTRIES } from "../lib/countries.js";
import { computeTableData } from "../lib/utils.js";

vi.mock("../app/components/Heatmap.jsx", () => ({
  default: props => <div data-testid="resource-grid">{JSON.stringify({ label: props.label, grid: props.grid, markerDelta: props.markerDelta })}</div>,
}));

afterEach(cleanup);

function scenario({ financial, health, early, market, benefits, credits, taxes, healthCosts, careCosts }) {
  return {
    aggregates: {
      financialResources: financial,
      householdNetIncome: financial,
      householdNetIncomeWithHealth: financial + health,
      healthcareBenefitValue: health,
      earlyEducationServiceValue: early,
      combinedResources: financial + health + early,
      marketIncome: market,
      householdBenefits: benefits,
      householdRefundableCredits: credits,
      householdTaxBeforeCredits: taxes,
      healthCosts,
      childcareCostDeducted: careCosts,
    },
    benefits: { snap: benefits }, health: { medicaid_cost: health },
    credits: { eitc: credits }, taxes: { income_tax_before_refundable_credits: taxes },
    stateCredits: {}, stateTaxes: {},
    childcare: { enabled: true, headStartValue: early, earlyHeadStartValue: 0, includeHeadStart: true },
  };
}

const results = {
  married: scenario({ financial: 50000, health: 10000, early: 5000, market: 65000, benefits: 2000, credits: 1000, taxes: 8000, healthCosts: 3000, careCosts: 7000 }),
  unmarried: scenario({ financial: 45000, health: 20000, early: 20000, market: 60000, benefits: 3000, credits: 500, taxes: 10000, healthCosts: 2000, careCosts: 6500 }),
};
const props = { country: COUNTRIES.us, results, headIncome: 30000, spouseIncome: 35000, livingArrangement: "cohabiting" };

describe("financial resources and service values", () => {
  it("keeps the primary financial gain separate from a loss in combined resources, regardless of ESI flags", () => {
    const { rerender } = render(<ResultsDisplay {...props} esiStatus={{}} />);
    const check = () => {
      expect(screen.getByTestId("metric-net").textContent).toContain("$45,000");
      expect(screen.getByTestId("metric-pct").textContent).toContain("$50,000");
      expect(screen.getByTestId("metric-delta").textContent).toContain("+$5,000");
      const comparison = screen.getByRole("region", { name: "Resource comparison" });
      const combined = within(comparison).getByRole("row", { name: /Combined resources/ });
      expect(combined.textContent).toContain("$85,000");
      expect(combined.textContent).toContain("$65,000");
      expect(combined.textContent).toContain("-$20,000");
      expect(within(comparison).getByRole("row", { name: /Healthcare service value/ }).textContent).toContain("$20,000");
      expect(within(comparison).getByRole("row", { name: /Early education service value/ }).textContent).toContain("$5,000");
    };
    check();
    rerender(<ResultsDisplay {...props} esiStatus={{ head: true, spouse: true }} />);
    check();
  });

  it("shows the explicit market income and every modeled deduction in the financial summary", () => {
    const rows = computeTableData(results, "summary", { countryId: "us", showHealth: true });
    const amount = label => rows.find(row => row.program === label)?.married;
    expect(amount("Household financial resources")).toBe("$50,000");
    expect(amount("Market income")).toBe("$65,000");
    expect(amount("Healthcare costs")).toBe("$3,000");
    expect(amount("Childcare costs")).toBe("$7,000");
    expect(rows.some(row => /service value|Combined resources/.test(row.program))).toBe(false);
  });

  it("keeps healthcare and early education out of financial benefits while preserving healthcare detail", async () => {
    const legacy = { ...results, married: { ...results.married, benefits: { ...results.married.benefits, head_start: 5000 } } };
    const benefits = computeTableData(legacy, "benefits", { countryId: "us" });
    expect(benefits.map(row => row.program)).toEqual(["Total benefits", "SNAP"]);
    expect(benefits[0].married).toBe("$2,000");
    render(<ResultsDisplay {...props} />);
    fireEvent.click(screen.getByText("Healthcare benefit details"));
    expect(await screen.findByText("Medicaid cost")).toBeTruthy();
  });

  it("uses financial resources for the summary grid and financial benefits for the benefits grid", async () => {
    const heatmapData = { grids: {
      "net income": [[5000]], "net income (with healthcare)": [[-5000]],
      benefits: [[-1000]], "healthcare benefits": [[-10000]],
    } };
    render(<ResultsDisplay {...props} heatmapData={heatmapData} esiStatus={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Grid", exact: true }));
    expect(JSON.parse((await screen.findByTestId("resource-grid")).textContent)).toEqual({
      label: "household financial resources", grid: [[5000]], markerDelta: 5000,
    });
    fireEvent.click(screen.getByRole("button", { name: "Benefits", exact: true }));
    expect(JSON.parse(screen.getByTestId("resource-grid").textContent)).toEqual({
      label: "benefits", grid: [[-1000]], markerDelta: -1000,
    });
  });

  it("shows an actionable grid error without hiding scalar resources or allowing duplicate retries", () => {
    const retry = vi.fn();
    const { rerender } = render(<ResultsDisplay {...props} heatmapError="The income grid could not load." onRetryHeatmap={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("The income grid could not load.");
    expect(screen.getByTestId("metric-pct").textContent).toContain("$50,000");
    fireEvent.click(screen.getByRole("button", { name: "Retry heatmap" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<ResultsDisplay {...props} heatmapError="The income grid could not load." onRetryHeatmap={retry} heatmapLoading />);
    expect(screen.queryByRole("button", { name: "Retry heatmap" })).toBeNull();
    expect(screen.getByTestId("metric-pct").textContent).toContain("$50,000");
  });
});
