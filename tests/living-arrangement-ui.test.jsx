/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import MarriageApp, { encodeToHash, decodeFromHash } from "../app/MarriageApp.jsx";
import InputForm from "../app/components/InputForm.jsx";
import ResultsDisplay from "../app/components/ResultsDisplay.jsx";
import Heatmap from "../app/components/Heatmap.jsx";
import { getCategorizedPrograms, getHeatmapData } from "../lib/api.js";
import { COUNTRIES } from "../lib/countries.js";
import { readFileSync } from "node:fs";

vi.mock("../lib/api.js", async (importOriginal) => ({
  ...await importOriginal(),
  getCategorizedPrograms: vi.fn(),
  getHeatmapData: vi.fn(),
}));

const data = {
  regionCode: "CA", headIncome: 20000, spouseIncome: 15000,
  headAge: 35, spouseAge: 40, children: [{ age: 5 }],
  disabilityStatus: {}, pregnancyStatus: {}, esiStatus: {}, year: "2026",
};
const scenario = (net, snap = 0) => ({
  aggregates: {
    householdNetIncome: net,
    householdNetIncomeWithHealth: net,
    householdBenefits: snap,
    householdRefundableCredits: 0,
    householdTaxBeforeCredits: 0,
    healthcareBenefitValue: 0,
  },
  benefits: { snap }, health: {}, credits: {}, taxes: {}, stateCredits: {}, stateTaxes: {},
});
const cohabitingResults = { married: scenario(33000, 2000), unmarried: scenario(35000, 2000) };
const separateResults = { married: scenario(33000), headSingle: scenario(20000), spouseSingle: scenario(15000) };

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScrollIntoView; });

function selectLivingSeparately() {
  fireEvent.click(screen.getByRole("radio", { name: /^Living separately/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  getCategorizedPrograms.mockResolvedValue(cohabitingResults);
  getHeatmapData.mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("comparison share links", () => {
  it.each(["cohabiting", "separate"])("round-trips the %s comparison and its year", (livingArrangement) => {
    const hash = encodeToHash("us", { ...data, livingArrangement }, false);
    expect(new URLSearchParams(hash).get("living")).toBe(livingArrangement);
    expect(new URLSearchParams(hash).get("year")).toBe("2026");
    window.history.replaceState(null, "", `#${hash}`);
    expect(decodeFromHash()).toMatchObject({ ...data, livingArrangement });
  });

  it("preserves the separate-household meaning of old US links", () => {
    window.history.replaceState(null, "", "#region=CA&head=20000&spouse=15000");
    expect(decodeFromHash()).toMatchObject({ countryId: "us", livingArrangement: "separate" });
  });

  it("does not introduce a living-arrangement parameter to UK links", () => {
    const hash = encodeToHash("uk", { ...data, regionCode: "ENGLAND" }, false);
    expect(new URLSearchParams(hash).has("living")).toBe(false);
    expect(new URLSearchParams(hash).get("year")).toBe("2026");
  });

  it("hydrates results and the focused comparison editor from a legacy link", async () => {
    getCategorizedPrograms.mockResolvedValue(separateResults);
    window.history.replaceState(null, "", "#region=CA&head=20000&spouse=15000");
    render(<React.StrictMode><MarriageApp initialCountry="us" /></React.StrictMode>);
    await screen.findByRole("heading", { name: "Effect of marrying and combining households" });
    expect(screen.queryByRole("textbox", { name: "You income" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit comparison" }));
    expect((await screen.findByRole("radio", { name: /^Living separately/ })).checked).toBe(true);
    expect(getCategorizedPrograms.mock.calls[0][12].livingArrangement).toBe("separate");
    expect(new URLSearchParams(window.location.hash.slice(1)).get("living")).toBe("separate");
  });
});

describe("living arrangement form", () => {
  const baseProps = { country: COUNTRIES.us, countryId: "us", section: "comparison", onCalculate: vi.fn(), loading: false };

  it("defaults a new US comparison to living together and submits the selected baseline", () => {
    const onCalculate = vi.fn();
    render(<InputForm {...baseProps} onCalculate={onCalculate} />);
    expect(screen.getByRole("radio", { name: /^Living together/ }).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onCalculate.mock.calls[0][0].livingArrangement).toBe("cohabiting");
    selectLivingSeparately();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onCalculate.mock.calls[1][0].livingArrangement).toBe("separate");
  });

  it("keeps the UK comparison unchanged", () => {
    render(<InputForm {...baseProps} country={COUNTRIES.uk} countryId="uk" />);
    expect(screen.queryByRole("radio", { name: /^Living together/ })).toBeNull();
    expect(screen.getByText(/UK benefits generally assess couples who live together/)).toBeTruthy();
  });

  it("ignores an old response after the user saves a different comparison", async () => {
    let resolve;
    getCategorizedPrograms.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    getCategorizedPrograms.mockResolvedValueOnce(separateResults);
    window.history.replaceState(null, "", "#country=us&region=CA&head=20000&spouse=15000&living=cohabiting");
    render(<MarriageApp initialCountry="us" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit comparison" }));
    selectLivingSeparately();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("heading", { name: "Effect of marrying and combining households" });
    await act(async () => { resolve(cohabitingResults); });
    expect(screen.getByRole("heading", { name: "Effect of marrying and combining households" })).toBeTruthy();
    expect(getCategorizedPrograms.mock.calls[1][12].livingArrangement).toBe("separate");
    expect(getHeatmapData).toHaveBeenCalledOnce();
  });
});

describe("comparison results", () => {
  const props = { country: COUNTRIES.us, headIncome: 20000, spouseIncome: 15000, esiStatus: { head: true } };

  it("shows shared benefits once and omits fictitious individual cohabiting amounts", () => {
    render(<ResultsDisplay {...props} results={cohabitingResults} livingArrangement="cohabiting" />);
    expect(screen.getByRole("heading", { name: "Effect of marriage" })).toBeTruthy();
    expect(screen.getByTestId("metric-net").textContent).toContain("$35,000");
    expect(screen.queryByRole("columnheader", { name: "You (unmarried)" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Benefits" }));
    const snapRow = screen.getByText("SNAP").closest("tr");
    expect(within(snapRow).getAllByText("$2,000")).toHaveLength(2);
    expect(within(snapRow).getByText("$0")).toBeTruthy();
    expect(screen.getByRole("note", { name: "Comparison assumptions" }).textContent).toContain("shares a home, food, and resources");
  });

  it("labels the effect of combining households separately from marriage alone", () => {
    render(<ResultsDisplay {...props} results={separateResults} livingArrangement="separate" />);
    expect(screen.getByRole("heading", { name: "Effect of marrying and combining households" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "You (unmarried)" })).toBeTruthy();
    expect(screen.getByTestId("metric-delta").textContent).toContain("Decrease");
    expect(screen.getByTestId("metric-delta").textContent).not.toContain("Marriage penalty");
  });

  it("keeps keyboard-accessible program explanations outside the scrolling table", async () => {
    // jsdom has no layout observer; the browser supplies this for positioning.
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    render(<ResultsDisplay {...props} results={cohabitingResults} />);
    fireEvent.click(screen.getByRole("button", { name: "Benefits" }));
    const label = screen.getByText("SNAP");
    expect(label.tabIndex).toBe(0);
    fireEvent.focus(label);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("buy and prepare food together");
    expect(screen.getByRole("region", { name: "Tax and benefit comparison" }).contains(tooltip)).toBe(false);
  });

  it("keeps comparison methodology in the app results instead of shared chrome", () => {
    render(<ResultsDisplay {...props} results={cohabitingResults} />);
    expect(screen.getByRole("note", { name: "Comparison assumptions" }).textContent).toContain("SNAP");
    expect(screen.getByRole("note", { name: "Comparison assumptions" }).textContent).toContain("US calculations use PolicyEngine US");
    const layout = readFileSync(`${process.cwd()}/app/layout.jsx`, "utf8");
    const sharedHeader = readFileSync(`${process.cwd()}/app/components/SiteHeader.jsx`, "utf8");
    expect(layout + sharedHeader).not.toMatch(/shared resource unit|keeping up the home|livingArrangement|US calculations use|1\.824\.1/);
  });

  it("discloses the Medicaid parent limitation only for cohabiting parents", () => {
    const { rerender } = render(<ResultsDisplay {...props} results={cohabitingResults} hasChildren />);
    expect(screen.getByRole("note", { name: "Comparison assumptions" }).textContent).toContain("Medicaid estimates use simplified parent/caretaker rules");
    rerender(<ResultsDisplay {...props} results={cohabitingResults} hasChildren={false} />);
    expect(screen.queryByText(/Medicaid estimates use simplified/)).toBeNull();
  });

  it("uses the joint cohabiting baseline at the hovered heatmap cell", () => {
    const { container } = render(<Heatmap
      grid={[[10, 20], [30, 40]]}
      unmarriedGrid={[[100, 200], [300, 400]]}
      unmarriedLabel="Unmarried, living together"
      headIncome={0} spouseIncome={0} maxIncome={1000} count={2}
    />);
    const svg = container.querySelector("svg");
    svg.getScreenCTM = () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) });
    // Cell head=1, partner=0, using the component's actual SVG coordinates.
    fireEvent.mouseMove(svg, { clientX: 435, clientY: 340 });
    expect(screen.getByText("Unmarried, living together: $200")).toBeTruthy();
    expect(screen.getByText("Married: $220")).toBeTruthy();
  });

  it("can switch from a changing category to an unchanged category and back", () => {
    const props = { headIncome: 0, spouseIncome: 0, maxIncome: 1000, count: 2 };
    const { rerender } = render(<Heatmap {...props} grid={[[10, 20], [30, 40]]} label="net income" />);
    rerender(<Heatmap {...props} grid={[[0, 0], [0, 0]]} label="benefits" />);
    expect(screen.getByText("No changes in benefits at these income levels.")).toBeTruthy();
    rerender(<Heatmap {...props} grid={[[10, 20], [30, 40]]} label="net income" />);
    expect(screen.getByRole("heading", { name: "Change in net income" })).toBeTruthy();
  });
});
