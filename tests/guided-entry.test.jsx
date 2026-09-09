/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import MarriageApp, { encodeToHash } from "../app/MarriageApp.jsx";
import { getCategorizedPrograms, getHeatmapData } from "../lib/api.js";

// Exercise the real shared form, dialog, and summary without network requests.
vi.mock("../lib/api.js", async (importOriginal) => ({
  ...await importOriginal(),
  getCategorizedPrograms: vi.fn(),
  getHeatmapData: vi.fn(),
}));
vi.mock("../app/components/ResultsDisplay.jsx", () => ({
  default: ({ results, headIncome, spouseIncome, onCellClick }) => (
    <section aria-label="Calculation results">
      <p>Calculated amount: {results.amount}</p>
      <p>Submitted earnings: {headIncome} and {spouseIncome}</p>
      <button onClick={() => onCellClick(30000, 25000)}>Explore earnings of 30000 and 25000</button>
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

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Continue", exact: true }));
}
function reachCalculation() {
  for (let step = 0; step < 10; step += 1) {
    if (screen.queryByRole("button", { name: "Calculate", exact: true })) return;
    next();
  }
  throw new Error("Setup never reached its final calculation step.");
}
function changeInput(name, value) {
  const field = screen.getByLabelText(name, { exact: true });
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}
function summary() {
  return screen.getByRole("region", { name: "Your household" });
}
async function edit(section = "household") {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${section}`, exact: true }));
  return screen.findByRole("dialog", { name: "Edit your household" });
}
async function sharedResults(hash = "#country=us&region=CA&head=15000&spouse=10000&year=2026&living=cohabiting") {
  window.history.replaceState(null, "", hash);
  render(<MarriageApp initialCountry="us" />);
  await screen.findByRole("region", { name: "Calculation results" });
}

it("keeps a new visit focused and sends no calculation while the user answers questions", () => {
  render(<MarriageApp initialCountry="us" />);
  expect(screen.getByRole("heading", { name: "What would you like to compare?" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "You income" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Use full form" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Calculate", exact: true })).toBeNull();
  next();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("45,000");
  expect(screen.getByRole("button", { name: "Add child" })).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "Year" })).toBeNull();
  reachCalculation();
  expect(getCategorizedPrograms).not.toHaveBeenCalled();
  expect(getHeatmapData).not.toHaveBeenCalled();
});

it("retains answers through Back, then replaces setup with results and a household summary", async () => {
  render(<MarriageApp initialCountry="us" />);
  next();
  changeInput("You income", "21000");
  changeInput("Your partner income", "9000");
  changeInput("You age", "37");
  fireEvent.click(screen.getByRole("button", { name: "Add child" }));
  changeInput("Child 1 age", "3");
  fireEvent.click(screen.getByRole("button", { name: "Back", exact: true }));
  next();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("21,000");
  expect(screen.getByLabelText("Child 1 age").value).toBe("3");
  reachCalculation();
  fireEvent.click(screen.getByRole("button", { name: "Calculate", exact: true }));
  await screen.findByRole("region", { name: "Calculation results" });
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  const request = getCategorizedPrograms.mock.calls[0];
  expect(request.slice(0, 4)).toEqual(["us", "CA", 21000, 9000]);
  expect(request[4]).toEqual([expect.objectContaining({ age: 3, isDisabled: false })]);
  expect(request[8]).toBe(37);
  expect(request[12].livingArrangement).toBe("cohabiting");
  expect(screen.queryByRole("textbox", { name: "You income" })).toBeNull();
  expect(screen.queryByRole("navigation", { name: "Setup progress" })).toBeNull();
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(summary().textContent).toContain("21,000");
  expect(new URLSearchParams(window.location.hash.slice(1)).get("head")).toBe("21000");
});

it.each([
  ["#country=us&region=CA&head=15000&spouse=10000&c=3:0&year=2026&living=cohabiting", "us", "cohabiting"],
  ["#region=CA&head=15000&spouse=10000&c=3:0&year=2026", "us", "separate"],
  ["#country=uk&region=ENGLAND&head=15000&spouse=10000&year=2026", "uk", "separate"],
])("opens shared results without mounting setup or the editing form: %s", async (hash, countryId, livingArrangement) => {
  window.history.replaceState(null, "", hash);
  render(<React.StrictMode><MarriageApp initialCountry="us" /></React.StrictMode>);
  await screen.findByRole("region", { name: "Calculation results" });
  expect(screen.queryByRole("navigation", { name: "Setup progress" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "You income" })).toBeNull();
  expect(summary().textContent).toContain("15,000");
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  expect(getCategorizedPrograms.mock.calls[0][0]).toBe(countryId);
  expect(getCategorizedPrograms.mock.calls[0][12].livingArrangement).toBe(livingArrangement);
  await edit();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("15,000");
  expect(screen.getByRole("textbox", { name: "Your partner income" }).value).toBe("10,000");
});

it("uses a country-only UK link for setup with fiscal-year labels", () => {
  window.history.replaceState(null, "", "#country=uk");
  render(<MarriageApp initialCountry="us" />);
  expect(screen.getByRole("heading", { name: "What would you like to compare?" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026-27");
  expect(screen.queryByRole("radio", { name: /^Living together/ })).toBeNull();
  next();
  expect(screen.getByRole("spinbutton", { name: "You age" }).value).toBe("35");
  expect(getCategorizedPrograms).not.toHaveBeenCalled();
});

it.each([
  "#country=us&head=15000",
  "#country=us&region=CA&head=15000&care=not-json",
])("falls back to setup for an incomplete or malformed hash: %s", (hash) => {
  window.history.replaceState(null, "", hash);
  render(<MarriageApp initialCountry="us" />);
  expect(screen.getByRole("heading", { name: "What would you like to compare?" })).toBeTruthy();
  expect(getCategorizedPrograms).not.toHaveBeenCalled();
  expect(getHeatmapData).not.toHaveBeenCalled();
});

it.each(["Cancel", "Escape"])("discards an earnings draft on %s and retains the committed results, summary, and URL", async (dismissal) => {
  await sharedResults();
  const hash = window.location.hash;
  const committedSummary = summary().textContent;
  const dialog = await edit();
  changeInput("You income", "99000");
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  if (dismissal === "Cancel") fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", exact: true }));
  else fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit household", exact: true })));
  expect(screen.getByText("Submitted earnings: 15000 and 10000")).toBeTruthy();
  expect(summary().textContent).toBe(committedSummary);
  expect(window.location.hash).toBe(hash);
  await edit();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("15,000");
});

it("discards a country change when the comparison editor is canceled", async () => {
  await sharedResults();
  const hash = window.location.hash;
  const committedSummary = summary().textContent;
  const dialog = await edit("comparison");
  fireEvent.keyDown(within(dialog).getByRole("combobox", { name: "Country" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "United Kingdom" }));
  expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026-27");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", exact: true }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  expect(window.location.hash).toBe(hash);
  expect(summary().textContent).toBe(committedSummary);
  expect(screen.getByText("Submitted earnings: 15000 and 10000")).toBeTruthy();
  await edit("comparison");
  expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026");
  expect(screen.getByRole("radio", { name: /^Living together/ })).toBeTruthy();
});

it.each([
  ["us", "CA", "United Kingdom", "uk", "ENGLAND"],
  ["uk", "ENGLAND", "United States", "us", "CA"],
])("saves a country change from %s without silently changing either adult's age or earnings", async (oldCountry, oldRegion, choice, newCountry, newRegion) => {
  await sharedResults(`#country=${oldCountry}&region=${oldRegion}&head=15000&spouse=10000&ha=63&sa=61&year=2026`);
  const dialog = await edit("comparison");
  fireEvent.keyDown(within(dialog).getByRole("combobox", { name: "Country" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: choice }));
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes", exact: true }));
  await waitFor(() => expect(getCategorizedPrograms).toHaveBeenCalledTimes(2));
  const request = getCategorizedPrograms.mock.calls[1];
  expect(request.slice(0, 4)).toEqual([newCountry, newRegion, 15000, 10000]);
  expect(request.slice(8, 10)).toEqual([63, 61]);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  expect(hash.get("country")).toBe(newCountry);
  expect(hash.get("ha")).toBe("63");
  expect(hash.get("sa")).toBe("61");
  await edit();
  expect(screen.getByLabelText("You age").value).toBe("63");
  expect(screen.getByLabelText("Your partner age").value).toBe("61");
});

it("saves changed earnings while preserving childcare, disability, and work answers", async () => {
  const initial = {
    regionCode: "CA", year: "2026", headIncome: 15000, spouseIncome: 10000,
    headAge: 40, spouseAge: 39, livingArrangement: "cohabiting",
    children: [{ age: 3, isDisabled: true, childcareCost: 4500, isHeadStartEnrolled: true,
      childcareHoursPerDay: 6, childcareDaysPerWeek: 3, childcareDaysPerMonth: 12 }],
    disabilityStatus: { head: true, spouse: false }, esiStatus: { head: true, spouse: false },
    ccdfSlotAvailable: false, childcareWorkHours: { head: 25, spouse: 30 },
  };
  await sharedResults(`#${encodeToHash("us", initial, false)}`);
  const first = getCategorizedPrograms.mock.calls[0];
  const dialog = await edit();
  expect(screen.queryByRole("combobox", { name: "Year" })).toBeNull();
  changeInput("You income", "22000");
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes", exact: true }));
  await screen.findByText("Submitted earnings: 22000 and 10000");
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("region", { name: "Comparison results" })));
  expect(getCategorizedPrograms).toHaveBeenCalledTimes(2);
  const saved = getCategorizedPrograms.mock.calls[1];
  expect(saved.slice(0, 4)).toEqual(["us", "CA", 22000, 10000]);
  // The form normalizes legacy omitted fields, but must retain every supplied answer.
  expect(saved[4][0]).toMatchObject(first[4][0]);
  expect(saved[5]).toEqual(first[5]);
  expect(saved[7]).toEqual(first[7]);
  expect(saved[10]).toEqual(first[10]);
  expect(saved[12]).toMatchObject({ ccdfSlotAvailable: false, childcareWorkHours: { head: 25, spouse: 30 } });
  expect(summary().textContent).toContain("22,000");
  expect(new URLSearchParams(window.location.hash.slice(1)).get("head")).toBe("22000");
});

it("opens and saves a relevant detail without exposing or changing other household inputs", async () => {
  await sharedResults();
  fireEvent.click(screen.getByText("Other household details", { exact: true }));
  expect(screen.queryByRole("button", { name: "Edit childcare", exact: true })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit housing", exact: true })).toBeNull();
  const dialog = await edit("health and disability");
  expect(screen.getByRole("checkbox", { name: "You meets SSI disability criteria" }).checked).toBe(false);
  expect(screen.queryByRole("textbox", { name: "You income" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Year" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "You meets SSI disability criteria" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes", exact: true }));
  await waitFor(() => expect(getCategorizedPrograms).toHaveBeenCalledTimes(2));
  expect(getCategorizedPrograms.mock.calls[1].slice(0, 4)).toEqual(["us", "CA", 15000, 10000]);
  expect(getCategorizedPrograms.mock.calls[1][5]).toEqual({ head: true, spouse: false });
  expect(summary().textContent).toContain("You: SSI disability");
  expect(new URLSearchParams(window.location.hash.slice(1)).get("hd")).toBe("1");
});

it("uses grid-selected earnings in the summary and as the next edit's starting values", async () => {
  await sharedResults();
  fireEvent.click(screen.getByRole("button", { name: "Explore earnings of 30000 and 25000" }));
  expect(summary().textContent).toContain("30,000");
  expect(summary().textContent).toContain("25,000");
  expect(new URLSearchParams(window.location.hash.slice(1)).get("head")).toBe("30000");
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  await edit();
  expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("30,000");
  expect(screen.getByRole("textbox", { name: "Your partner income" }).value).toBe("25,000");
});

it("retains the submitted household after a failed setup calculation and retries that snapshot", async () => {
  getCategorizedPrograms.mockRejectedValueOnce(new Error("Calculation service unavailable."));
  render(<MarriageApp initialCountry="us" />);
  reachCalculation();
  fireEvent.click(screen.getByRole("button", { name: "Calculate", exact: true }));
  expect((await screen.findByRole("alert")).textContent).toContain("Calculation service unavailable.");
  expect(screen.queryByRole("textbox", { name: "You income" })).toBeNull();
  expect(summary().textContent).toContain("45,000");
  const first = getCategorizedPrograms.mock.calls[0];
  fireEvent.click(screen.getByRole("button", { name: "Retry calculation", exact: true }));
  await screen.findByRole("region", { name: "Calculation results" });
  await waitFor(() => expect(getHeatmapData).toHaveBeenCalledOnce());
  expect(getCategorizedPrograms).toHaveBeenCalledTimes(2);
  expect(getCategorizedPrograms.mock.calls[1].slice(0, 12)).toEqual(first.slice(0, 12));
  expect(getCategorizedPrograms.mock.calls[1][12].signal).not.toBe(first[12].signal);
  expect(screen.queryByRole("alert")).toBeNull();
});
