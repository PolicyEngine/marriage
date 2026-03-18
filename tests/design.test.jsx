/**
 * Design tests for the marriage calculator refresh.
 * Tests MetricCards component rendering and year toggle segmented control.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import MetricCards from "../src/components/MetricCards.jsx";

afterEach(cleanup);

// ---------- Mock results factory ----------

function makeResults(marriedNet, headNet, spouseNet) {
  return {
    married: {
      aggregates: {
        householdNetIncome: marriedNet,
        householdNetIncomeWithHealth: marriedNet + 1000,
        householdBenefits: 0,
        householdRefundableCredits: 0,
        householdTaxBeforeCredits: 0,
        healthcareBenefitValue: 1000,
      },
    },
    headSingle: {
      aggregates: {
        householdNetIncome: headNet,
        householdNetIncomeWithHealth: headNet + 500,
        householdBenefits: 0,
        householdRefundableCredits: 0,
        householdTaxBeforeCredits: 0,
        healthcareBenefitValue: 500,
      },
    },
    spouseSingle: {
      aggregates: {
        householdNetIncome: spouseNet,
        householdNetIncomeWithHealth: spouseNet + 500,
        householdBenefits: 0,
        householdRefundableCredits: 0,
        householdTaxBeforeCredits: 0,
        healthcareBenefitValue: 500,
      },
    },
  };
}

// ---------- MetricCards ----------

describe("MetricCards", () => {
  it("renders 3 cards with correct testids", () => {
    const results = makeResults(90000, 50000, 45000);
    render(<MetricCards results={results} showHealth={false} currencySymbol="$" />);
    expect(screen.getByTestId("metric-net")).toBeTruthy();
    expect(screen.getByTestId("metric-delta")).toBeTruthy();
    expect(screen.getByTestId("metric-pct")).toBeTruthy();
  });

  it("displays formatted currency values", () => {
    const results = makeResults(92000, 50000, 45000);
    render(<MetricCards results={results} showHealth={false} currencySymbol="$" />);

    // Not married = headNet + spouseNet = 95000
    expect(screen.getByTestId("metric-net").textContent).toContain("$95,000");
    // Delta = married - separate = 92000 - 95000 = -3000
    expect(screen.getByTestId("metric-delta").textContent).toContain("$3,000");
  });

  it("applies bonus class when delta is positive (marriage bonus)", () => {
    // Married > separate => bonus
    const results = makeResults(100000, 50000, 45000);
    render(<MetricCards results={results} showHealth={false} currencySymbol="$" />);
    const deltaCard = screen.getByTestId("metric-delta");
    expect(deltaCard.className).toContain("bonus");
    expect(deltaCard.className).not.toContain("penalty");
  });

  it("applies penalty class when delta is negative (marriage penalty)", () => {
    // Married < separate => penalty
    const results = makeResults(80000, 50000, 45000);
    render(<MetricCards results={results} showHealth={false} currencySymbol="$" />);
    const deltaCard = screen.getByTestId("metric-delta");
    expect(deltaCard.className).toContain("penalty");
    expect(deltaCard.className).not.toContain("bonus");
  });

  it("shows neutral styling when delta is zero", () => {
    const results = makeResults(95000, 50000, 45000);
    render(<MetricCards results={results} showHealth={false} currencySymbol="$" />);
    const deltaCard = screen.getByTestId("metric-delta");
    expect(deltaCard.className).not.toContain("bonus");
    expect(deltaCard.className).not.toContain("penalty");
  });

  it("computes correct values from results", () => {
    // married=120000, head=70000, spouse=40000 => separate=110000, delta=+10000
    const results = makeResults(120000, 70000, 40000);
    render(<MetricCards results={results} showHealth={false} currencySymbol="$" />);

    expect(screen.getByTestId("metric-net").textContent).toContain("$110,000");
    expect(screen.getByTestId("metric-delta").textContent).toContain("$10,000");
  });

  it("uses showHealth to switch net income calculation", () => {
    // Without health: married=90000, separate=95000
    // With health: married=91000, separate=96000
    const results = makeResults(90000, 50000, 45000);
    render(<MetricCards results={results} showHealth={true} currencySymbol="$" />);
    // With health: headNetWithHealth=50500, spouseNetWithHealth=45500 => separate=96000
    expect(screen.getByTestId("metric-net").textContent).toContain("$96,000");
  });

  it("uses the provided currency symbol", () => {
    const results = makeResults(90000, 50000, 45000);
    const pound = String.fromCharCode(0x00A3);
    render(<MetricCards results={results} showHealth={false} currencySymbol={pound} />);
    expect(screen.getByTestId("metric-net").textContent).toContain(pound);
  });

  it("shows married net income in pct card", () => {
    const results = makeResults(120000, 70000, 40000);
    render(<MetricCards results={results} showHealth={false} currencySymbol="$" />);
    expect(screen.getByTestId("metric-pct").textContent).toContain("$120,000");
  });

  it("shows percentage change in delta card description", () => {
    // married=120000, separate=110000, delta=10000
    // pct = 10000/110000 = 9.1%
    const results = makeResults(120000, 70000, 40000);
    render(<MetricCards results={results} showHealth={false} currencySymbol="$" />);
    expect(screen.getByTestId("metric-delta").textContent).toContain("9.1%");
  });
});

// ---------- Country toggle & year select ----------

describe("Country toggle", () => {
  const countries = {
    us: { id: "us", name: "United States" },
    uk: { id: "uk", name: "United Kingdom" },
  };
  const country = {
    id: "us",
    currencySymbol: "$",
    defaultYear: "2026",
    availableYears: ["2024", "2025", "2026"],
    defaultAge: 40,
    defaultRegion: "CA",
    regions: [{ code: "CA", name: "California" }],
    regionLabel: "State",
    hasDisability: false,
    hasPregnancy: false,
    hasESI: false,
  };

  it("renders country toggle buttons", async () => {
    const { default: InputForm } = await import("../src/components/InputForm.jsx");
    render(<InputForm country={country} countries={countries} countryId="us" onCountryChange={() => {}} onCalculate={() => {}} loading={false} />);

    const toggle = document.querySelector(".country-toggle");
    expect(toggle).toBeTruthy();
    const buttons = toggle.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toBe("United States");
    expect(buttons[1].textContent).toBe("United Kingdom");
  });

  it("active country has active class", async () => {
    const { default: InputForm } = await import("../src/components/InputForm.jsx");
    render(<InputForm country={country} countries={countries} countryId="us" onCountryChange={() => {}} onCalculate={() => {}} loading={false} />);

    const buttons = document.querySelectorAll(".country-toggle button");
    expect(buttons[0].className).toContain("active");
    expect(buttons[1].className).not.toContain("active");
  });

  it("renders year as a select dropdown", async () => {
    const { default: InputForm } = await import("../src/components/InputForm.jsx");
    render(<InputForm country={country} countries={countries} countryId="us" onCountryChange={() => {}} onCalculate={() => {}} loading={false} />);

    const yearSelect = document.querySelector(".sf-year select");
    expect(yearSelect).toBeTruthy();
    expect(yearSelect.value).toBe("2026");
    expect(yearSelect.options.length).toBe(3);
  });

  it("renders a visible assumptions summary", async () => {
    const { default: InputForm } = await import("../src/components/InputForm.jsx");
    const assumptionCountry = {
      ...country,
      hasDisability: true,
      hasPregnancy: true,
      hasESI: true,
    };
    render(<InputForm country={assumptionCountry} countries={countries} countryId="us" onCountryChange={() => {}} onCalculate={() => {}} loading={false} />);

    const note = screen.getByRole("note", { name: "Model assumptions" });
    expect(within(note).getByText("Assumptions")).toBeTruthy();
    expect(within(note).getByText(/wages and salaries only/i)).toBeTruthy();
    expect(within(note).getByText(/all children are assigned to you/i)).toBeTruthy();
    expect(within(note).getByText(/healthcare benefits are excluded from the analysis/i)).toBeTruthy();
  });
});
