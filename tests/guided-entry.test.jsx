/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import MarriageApp from "../app/MarriageApp.jsx";
import { getCategorizedPrograms, getHeatmapData } from "../lib/api.js";

// Keep the real form's model-independent helpers, while preventing calculations
// from reaching either country API during these entry-flow regressions.
vi.mock("../lib/api.js", async (importOriginal) => ({
  ...await importOriginal(),
  getCategorizedPrograms: vi.fn(),
  getHeatmapData: vi.fn(),
}));
vi.mock("../app/components/ResultsDisplay.jsx", () => ({
  default: ({ results, headIncome, spouseIncome }) => (
    <section aria-label="Calculation results">
      <p>Calculated amount: {results.amount}</p>
      <p>Submitted earnings: {headIncome} and {spouseIncome}</p>
    </section>
  ),
}));

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScrollIntoView; });
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  getCategorizedPrograms.mockResolvedValue({ amount: 35000 });
  getHeatmapData.mockResolvedValue(null);
});
afterEach(cleanup);

function progress() {
  return screen.getByRole("navigation", { name: "Setup progress" });
}
function continueSetup() {
  fireEvent.click(screen.getByRole("button", { name: "Continue", exact: true }));
}
function changeInput(name, value) {
  const field = screen.getByLabelText(name, { exact: true });
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}
function reachDetails() {
  continueSetup();
  continueSetup();
}

it("starts a new visit with comparison, household, and details, without sending an early calculation", () => {
  render(<MarriageApp initialCountry="us" />);
  expect(progress().textContent).toMatch(/Comparison.*Household.*Details/);
  expect(within(progress()).getByText("Comparison").closest("li").getAttribute("aria-current")).toBe("step");
  expect(screen.queryByRole("button", { name: "Calculate", exact: true })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "You income" })).toBeNull();
  expect(getCategorizedPrograms).not.toHaveBeenCalled();

  continueSetup();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("45,000");
  expect(screen.getByRole("button", { name: "Add child" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Calculate", exact: true })).toBeNull();
  expect(getCategorizedPrograms).not.toHaveBeenCalled();

  continueSetup();
  expect(screen.getByRole("checkbox", { name: "You meets SSI disability criteria" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Calculate", exact: true })).toBeTruthy();
  expect(getCategorizedPrograms).not.toHaveBeenCalled();
  expect(getHeatmapData).not.toHaveBeenCalled();
});

it("submits the guided household once and keeps it editable after results and subsequent input changes", async () => {
  render(<MarriageApp initialCountry="us" />);
  continueSetup();
  changeInput("You income", "21000");
  changeInput("Your partner income", "9000");
  changeInput("You age", "37");
  fireEvent.click(screen.getByRole("button", { name: "Add child" }));
  changeInput("Child 1 age", "3");

  // Revisiting a preceding step must not remount the household fields.
  fireEvent.click(screen.getByRole("button", { name: "Back", exact: true }));
  continueSetup();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("21,000");
  expect(screen.getByLabelText("Child 1 age").value).toBe("3");
  continueSetup();
  fireEvent.click(screen.getByRole("checkbox", { name: "You meets SSI disability criteria" }));
  fireEvent.click(screen.getByRole("button", { name: "Calculate", exact: true }));

  await screen.findByRole("region", { name: "Calculation results" });
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  const firstRequest = getCategorizedPrograms.mock.calls[0];
  expect(firstRequest.slice(0, 4)).toEqual(["us", "CA", 21000, 9000]);
  expect(firstRequest[4]).toEqual([expect.objectContaining({ age: 3, isDisabled: false })]);
  expect(firstRequest[5]).toEqual({ head: true, spouse: false });
  expect(firstRequest[8]).toBe(37);
  expect(firstRequest[12].livingArrangement).toBe("cohabiting");
  expect(screen.queryByRole("navigation", { name: "Setup progress" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("21,000");
  expect(new URLSearchParams(window.location.hash.slice(1)).get("head")).toBe("21000");

  changeInput("You income", "22000");
  expect(screen.queryByRole("region", { name: "Calculation results" })).toBeNull();
  expect(screen.queryByRole("navigation", { name: "Setup progress" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Calculate", exact: true }));
  await screen.findByText("Submitted earnings: 22000 and 9000");
  expect(getCategorizedPrograms).toHaveBeenCalledTimes(2);
  expect(getCategorizedPrograms.mock.calls[1][4]).toEqual(firstRequest[4]);
  expect(getCategorizedPrograms.mock.calls[1][5]).toEqual(firstRequest[5]);
});

it.each([
  "#country=us&region=CA&head=15000&spouse=10000&c=3:0&year=2026&living=cohabiting",
  "#region=CA&head=15000&spouse=10000&c=3:0&year=2026",
])("opens a shared calculation directly in the editor: %s", async (hash) => {
  window.history.replaceState(null, "", hash);
  render(<React.StrictMode><MarriageApp initialCountry="us" /></React.StrictMode>);
  await screen.findByRole("region", { name: "Calculation results" });
  expect(screen.queryByRole("navigation", { name: "Setup progress" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("15,000");
  expect(screen.getByRole("textbox", { name: "Your partner income" }).value).toBe("10,000");
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  expect(getCategorizedPrograms.mock.calls[0][12].livingArrangement).toBe(hash.includes("living=cohabiting") ? "cohabiting" : "separate");
});

it("uses a country-only UK link to start guided setup with fiscal-year labels", () => {
  window.history.replaceState(null, "", "#country=uk");
  render(<MarriageApp initialCountry="us" />);
  expect(progress()).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026-27");
  expect(screen.queryByRole("combobox", { name: "Unmarried living arrangement" })).toBeNull();
  continueSetup();
  expect(screen.getByRole("spinbutton", { name: "You age" }).value).toBe("35");
  expect(getCategorizedPrograms).not.toHaveBeenCalled();
});

it.each([
  "#country=us&head=15000",
  "#country=us&region=CA&head=15000&care=not-json",
])("falls back to guided setup for an incomplete or malformed calculation hash: %s", (hash) => {
  window.history.replaceState(null, "", hash);
  render(<MarriageApp initialCountry="us" />);
  expect(progress()).toBeTruthy();
  expect(getCategorizedPrograms).not.toHaveBeenCalled();
  expect(getHeatmapData).not.toHaveBeenCalled();
});

it("can leave guided setup for the full editor without discarding entered inputs", async () => {
  render(<MarriageApp initialCountry="us" />);
  continueSetup();
  changeInput("You income", "32000");
  fireEvent.click(screen.getByRole("button", { name: "Add child" }));
  changeInput("Child 1 age", "8");
  fireEvent.click(screen.getByRole("button", { name: "Use full form", exact: true }));
  expect(screen.queryByRole("navigation", { name: "Setup progress" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("32,000");
  expect(getCategorizedPrograms).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Calculate", exact: true }));
  await screen.findByRole("region", { name: "Calculation results" });
  expect(getCategorizedPrograms.mock.calls[0][2]).toBe(32000);
  expect(getCategorizedPrograms.mock.calls[0][4]).toEqual([expect.objectContaining({ age: 8 })]);
});

it("shows a failed guided calculation in the editor and retries the same submitted household", async () => {
  getCategorizedPrograms.mockRejectedValueOnce(new Error("Calculation service unavailable."));
  render(<MarriageApp initialCountry="us" />);
  reachDetails();
  fireEvent.click(screen.getByRole("checkbox", { name: "You meets SSI disability criteria" }));
  fireEvent.click(screen.getByRole("button", { name: "Calculate", exact: true }));
  expect((await screen.findByRole("alert")).textContent).toContain("Calculation service unavailable.");
  expect(screen.queryByRole("navigation", { name: "Setup progress" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("45,000");
  const firstRequest = getCategorizedPrograms.mock.calls[0];
  fireEvent.click(screen.getByRole("button", { name: "Retry calculation", exact: true }));
  await screen.findByRole("region", { name: "Calculation results" });
  await waitFor(() => expect(getHeatmapData).toHaveBeenCalledOnce());
  expect(getCategorizedPrograms).toHaveBeenCalledTimes(2);
  expect(getCategorizedPrograms.mock.calls[1].slice(0, 12)).toEqual(firstRequest.slice(0, 12));
  expect(getCategorizedPrograms.mock.calls[1][12].signal).not.toBe(firstRequest[12].signal);
  expect(screen.queryByRole("alert")).toBeNull();
});
