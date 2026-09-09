/**
 * Design tests for the marriage calculator refresh.
 * Tests MetricCards component rendering and year toggle segmented control.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import MetricCards from "../app/components/MetricCards.jsx";
import { COUNTRIES, UK_BRMAS } from "../lib/countries.js";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScrollIntoView; });

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

// ---------- Focused form design ----------

describe("Shared form controls", () => {
  it("uses the shared country dropdown and commits only after saving", async () => {
    const { default: InputForm } = await import("../app/components/InputForm.jsx");
    const onCountryChange = vi.fn();
    const onCalculate = vi.fn();
    render(<InputForm country={COUNTRIES.us} countries={COUNTRIES} countryId="us" section="comparison" onCountryChange={onCountryChange} onCalculate={onCalculate} />);
    const country = screen.getByRole("combobox", { name: "Country" });
    expect(country.getAttribute("data-slot")).toBe("select-trigger");
    expect(country.textContent).toBe("United States");
    fireEvent.keyDown(country, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "United Kingdom" }));
    expect(onCountryChange).toHaveBeenCalledWith("uk");
    expect(onCalculate).not.toHaveBeenCalled();
  });

  it("supports keyboard year selection without submitting", async () => {
    const { default: InputForm } = await import("../app/components/InputForm.jsx");
    const onCalculate = vi.fn();
    const country = { ...COUNTRIES.us, availableYears: ["2024", "2025", "2026"] };
    render(<InputForm country={country} countryId="us" section="comparison" onCalculate={onCalculate} />);
    const yearSelect = screen.getByRole("combobox", { name: "Year" });
    expect(yearSelect.getAttribute("data-slot")).toBe("select-trigger");
    expect(yearSelect.textContent).toBe("2026");
    fireEvent.keyDown(yearSelect, { key: "ArrowDown" });
    const selectedOption = await screen.findByRole("option", { name: "2026" });
    await waitFor(() => expect(document.activeElement).toBe(selectedOption));
    fireEvent.keyDown(selectedOption, { key: "ArrowUp" });
    const previousYear = screen.getByRole("option", { name: "2025" });
    await waitFor(() => expect(document.activeElement).toBe(previousYear));
    fireEvent.keyDown(previousYear, { key: "Enter" });
    expect(yearSelect.textContent).toBe("2025");
    expect(onCalculate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onCalculate.mock.calls[0][0].year).toBe("2025");
  });

  it("uses UK fiscal years and shared housing controls in their own section", async () => {
    const { default: InputForm } = await import("../app/components/InputForm.jsx");
    const onCalculate = vi.fn();
    const { unmount } = render(<InputForm country={COUNTRIES.uk} countryId="uk" section="comparison" onCalculate={onCalculate} />);
    for (const name of ["UK nation", "Year"]) expect(screen.getByRole("combobox", { name }).getAttribute("data-slot")).toBe("select-trigger");
    expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026-27");
    unmount();
    render(<InputForm country={COUNTRIES.uk} countryId="uk" section="housing" onCalculate={onCalculate} />);
    expect(screen.getByRole("combobox", { name: "Tenure" }).getAttribute("data-slot")).toBe("select-trigger");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Tenure" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Rented privately" }));
    const area = screen.getByRole("combobox", { name: "Rental market area" });
    expect(area.getAttribute("data-slot")).toBe("select-trigger");
    fireEvent.keyDown(area, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: UK_BRMAS[0].name }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onCalculate.mock.calls[0][0]).toMatchObject({ tenureType: "RENT_PRIVATELY", brma: UK_BRMAS[0].code, year: "2026" });
  });

  it("offers full assumptions at the final setup question", async () => {
    const { default: InputForm } = await import("../app/components/InputForm.jsx");
    render(<InputForm country={COUNTRIES.us} countryId="us" onCalculate={() => {}} />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Continue", exact: true }));
    const details = document.querySelector(".sf-assumptions");
    expect(details.open).toBe(false);
    fireEvent.click(within(details).getByText("Assumptions"));
    const note = within(details).getByRole("note", { name: "Model assumptions" });
    expect(within(note).getByText(/wages and salaries only/i)).toBeTruthy();
    expect(within(note).getByText(/all children are assigned to you/i)).toBeTruthy();
    expect(within(note).getByText(/employer-sponsored insurance/i)).toBeTruthy();
    expect(within(note).queryByText(/healthcare benefits are excluded from the analysis/i)).toBeNull();
  });
});
