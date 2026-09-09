/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ResultsDisplay from "../app/components/ResultsDisplay.jsx";
import ImpactDrivers from "../app/components/ImpactDrivers.jsx";
import { COUNTRIES } from "../lib/countries";

vi.mock("../app/components/Heatmap.jsx", () => ({
  default: props => <button onClick={() => props.onCellClick(0, 1)}>Select another income combination</button>,
}));

afterEach(cleanup);

function scenario({ market = 90000, tax = 0, benefit = 0, credit = 0, healthCost = 0, careCost = 0, rent = 0, health = 0, education = 0, benefitName = "snap", taxName = "income_tax_before_refundable_credits" } = {}) {
  const financial = market + benefit + credit - tax - healthCost - careCost - rent;
  return {
    aggregates: {
      marketIncome: market,
      financialResources: financial,
      householdNetIncome: financial,
      householdNetIncomeWithHealth: financial + health,
      householdBenefits: benefit,
      householdRefundableCredits: credit,
      householdTaxBeforeCredits: tax,
      healthcareBenefitValue: health,
      earlyEducationServiceValue: education,
      healthCosts: healthCost,
      childcareCostDeducted: careCost,
      rentDeducted: rent,
    },
    benefits: { [benefitName]: benefit, head_start: education },
    credits: { eitc: credit },
    taxes: { [taxName]: tax },
    stateCredits: {}, stateTaxes: {}, health: { medicaid_cost: health },
  };
}

function drivers() {
  return within(screen.getByRole("region", { name: "What changes" }));
}

describe("financial change explanations", () => {
  it("explains tax increases and benefit losses as reduced resources, ranks the largest changes, and excludes service values", () => {
    const results = {
      unmarried: scenario({ tax: 10000, benefit: 2000, credit: 1000, healthCost: 4000, health: 50000, education: 30000 }),
      married: scenario({ tax: 13000, benefit: 500, credit: 1500, healthCost: 5000 }),
    };
    render(<ImpactDrivers results={results} countryId="us" currencySymbol="$" />);
    const items = drivers().getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("-$3,000Higher taxes");
    expect(items[1].textContent).toBe("SNAP-$1,500Less benefit income");
    expect(items[2].textContent).toBe("Healthcare costs-$1,000Higher costs");
    expect(drivers().queryByText(/Medicaid|Head Start|service value/)).toBeNull();
    expect(drivers().getByText("Largest changes in annual financial resources.")).toBeTruthy();
  });

  it("shows lower taxes, higher credits, and reduced childcare costs as gains", () => {
    const results = {
      unmarried: scenario({ tax: 4000, credit: 500, careCost: 6000 }),
      married: scenario({ tax: 1000, credit: 2500, careCost: 5000 }),
    };
    render(<ImpactDrivers results={results} countryId="us" currencySymbol="$" />);
    expect(drivers().getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Income tax before refundable credits+$3,000Lower taxes",
      "EITC+$2,000More refundable credits",
      "Childcare costs+$1,000Lower costs",
    ]);
  });

  it("omits an empty explanation but keeps offsetting changes when the net effect is zero", () => {
    const same = scenario({ tax: 5000 });
    const { rerender } = render(<ImpactDrivers results={{ unmarried: same, married: same }} countryId="us" currencySymbol="$" />);
    expect(screen.queryByRole("region", { name: "What changes" })).toBeNull();
    rerender(<ImpactDrivers results={{ unmarried: same, married: scenario({ tax: 6000, benefit: 1000 }) }} countryId="us" currencySymbol="$" />);
    const copy = drivers().getAllByRole("listitem").map(item => item.textContent).join(" ");
    expect(copy).toContain("+$1,000More benefit income");
    expect(copy).toContain("-$1,000Higher taxes");
  });

  it("combines separate UK households and explains housing savings using pounds", () => {
    const results = {
      headSingle: scenario({ market: 20000, benefit: 5000, rent: 6000, benefitName: "universal_credit", taxName: "income_tax" }),
      spouseSingle: scenario({ market: 10000, benefit: 2000, rent: 6000, benefitName: "universal_credit", taxName: "income_tax" }),
      married: scenario({ market: 30000, benefit: 3000, rent: 6000, benefitName: "universal_credit", taxName: "income_tax" }),
    };
    render(<ImpactDrivers results={results} countryId="uk" currencySymbol="£" />);
    expect(drivers().getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Housing costs+£6,000Lower costs",
      "Universal credit-£4,000Less benefit income",
    ]);
    expect(drivers().getByText("Largest changes in annual net income.")).toBeTruthy();
  });

  it("updates the explanation with the same real grid projection used by the financial headline", async () => {
    const results = {
      unmarried: scenario({ tax: 10000 }),
      married: scenario({ tax: 12000 }),
    };
    const series = (married, unmarried) => ({ married: [0, married, 0, 0], unmarried: [0, unmarried, 0, 0] });
    const heatmapData = {
      count: 2, maxIncome: 10000,
      grids: { "net income": [[0, -5000], [0, 0]] },
      programData: {
        financial_resources: series(43000, 48000),
        household_net_income: series(43000, 48000),
        household_market_income: series(50000, 50000),
        household_benefits: series(1000, 8000),
        household_tax_before_refundable_credits: series(8000, 10000),
        snap: series(1000, 8000),
        income_tax_before_refundable_credits: series(8000, 10000),
      },
    };
    const onCellClick = vi.fn();
    render(<ResultsDisplay results={results} country={COUNTRIES.us} heatmapData={heatmapData} onCellClick={onCellClick} />);
    expect(drivers().getAllByRole("listitem")[0].textContent).toContain("-$2,000Higher taxes");
    fireEvent.click(screen.getByRole("button", { name: "Grid", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Select another income combination" }));
    expect(onCellClick).toHaveBeenCalledWith(0, 10000);
    expect(screen.getByTestId("metric-delta").textContent).toContain("-$5,000");
    expect(drivers().getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "SNAP-$7,000Less benefit income",
      "Income tax before refundable credits+$2,000Lower taxes",
    ]);
  });
});
