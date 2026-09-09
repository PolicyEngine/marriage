/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MarriageApp from "../app/MarriageApp.jsx";
import { getCategorizedPrograms, getHeatmapData } from "../lib/api.js";

let submitted;
vi.mock("../lib/api.js", async (importOriginal) => ({
  ...await importOriginal(), getCategorizedPrograms: vi.fn(), getHeatmapData: vi.fn(),
}));
vi.mock("../app/components/InputForm.jsx", () => ({
  default: ({ onCalculate, onCancel, onCountryChange, section }) => <div>
    <button onClick={() => onCalculate(submitted)}>{section ? "Save changes" : "Submit inputs"}</button>
    {section && <button onClick={onCancel}>Cancel</button>}
    <button onClick={() => onCountryChange("uk")}>Switch country</button>
  </div>,
}));
vi.mock("../app/components/ResultsDisplay.jsx", () => ({
  default: ({ results, heatmapData, heatmapError, onRetryHeatmap, heatmapLoading }) => <div>
    <p>Calculated amount: {results.amount}</p>
    {heatmapData && <p>Heatmap ready</p>}
    {heatmapError && <div role="alert">{heatmapError}<button disabled={heatmapLoading} onClick={onRetryHeatmap}>Retry heatmap</button></div>}
  </div>,
}));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function edit(section = "household") {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${section}`, exact: true }));
  return screen.findByRole("dialog", { name: "Edit your household" });
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
  submitted = { regionCode: "CA", headIncome: 20000, spouseIncome: 15000,
    headAge: 40, spouseAge: 40, children: [{ age: 3 }], disabilityStatus: {},
    pregnancyStatus: {}, esiStatus: {}, year: "2026", livingArrangement: "cohabiting" };
  getCategorizedPrograms.mockResolvedValue({ amount: 35000 });
  getHeatmapData.mockResolvedValue({ ready: true });
});
afterEach(cleanup);

it("shows a scalar error and retries the retained input snapshot with a new request signal", async () => {
  getCategorizedPrograms.mockRejectedValueOnce(new Error("Calculation service unavailable."));
  render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Calculation service unavailable.");
  const firstSignal = getCategorizedPrograms.mock.calls[0][12].signal;
  expect(firstSignal.aborted).toBe(true);
  submitted.children[0].age = 12;
  submitted.headIncome = 90000;
  fireEvent.click(screen.getByRole("button", { name: "Retry calculation" }));
  await screen.findByText("Calculated amount: 35000");
  expect(getCategorizedPrograms).toHaveBeenCalledTimes(2);
  const retry = getCategorizedPrograms.mock.calls[1];
  expect(retry[2]).toBe(20000);
  expect(retry[4]).toEqual([{ age: 3 }]);
  expect(retry[12].signal).not.toBe(firstSignal);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("preserves scalar results after a heatmap failure and retries only the heatmap", async () => {
  getHeatmapData.mockRejectedValueOnce(new Error("The heatmap took too long."));
  render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  expect((await screen.findByRole("alert")).textContent).toContain("The heatmap took too long.");
  expect(screen.getByText("Calculated amount: 35000")).toBeTruthy();
  const first = getHeatmapData.mock.calls[0];
  fireEvent.click(screen.getByRole("button", { name: "Retry heatmap" }));
  await screen.findByText("Heatmap ready");
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  expect(getHeatmapData).toHaveBeenCalledTimes(2);
  expect(getHeatmapData.mock.calls[1].slice(0, 12)).toEqual(first.slice(0, 12));
  expect(getHeatmapData.mock.calls[1][12].signal).not.toBe(first[12].signal);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("lets an active calculation finish while a draft editor is opened and canceled", async () => {
  const pending = deferred();
  getCategorizedPrograms.mockReturnValueOnce(pending.promise);
  render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  const signal = getCategorizedPrograms.mock.calls[0][12].signal;
  const dialog = await edit();
  submitted = { ...submitted, headIncome: 90000 };
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", exact: true }));
  expect(signal.aborted).toBe(false);
  await act(async () => pending.resolve({ amount: 111 }));
  await screen.findByText("Calculated amount: 111");
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  expect(getHeatmapData.mock.calls[0][6]).toBe(20000);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not cancel a heatmap for a discarded country draft", async () => {
  const pending = deferred();
  getHeatmapData.mockReturnValueOnce(pending.promise);
  render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  await waitFor(() => expect(getHeatmapData).toHaveBeenCalledOnce());
  const signal = getHeatmapData.mock.calls[0][12].signal;
  const dialog = await edit("comparison");
  fireEvent.click(within(dialog).getByRole("button", { name: "Switch country" }));
  expect(signal.aborted).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", exact: true }));
  await act(async () => pending.resolve({ ready: true }));
  await screen.findByText("Heatmap ready");
  expect(screen.getByText("Calculated amount: 35000")).toBeTruthy();
  expect(getCategorizedPrograms).toHaveBeenCalledOnce();
  expect(new URLSearchParams(window.location.hash.slice(1)).get("country")).toBe("us");
});

it("cancels a pending heatmap only when the new country is saved and ignores the obsolete error", async () => {
  const pending = deferred();
  getHeatmapData.mockReturnValueOnce(pending.promise);
  render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  await waitFor(() => expect(getHeatmapData).toHaveBeenCalledOnce());
  const signal = getHeatmapData.mock.calls[0][12].signal;
  const dialog = await edit("comparison");
  fireEvent.click(within(dialog).getByRole("button", { name: "Switch country" }));
  submitted = { ...submitted, regionCode: "ENGLAND", livingArrangement: "separate" };
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes", exact: true }));
  expect(signal.aborted).toBe(true);
  await waitFor(() => expect(getCategorizedPrograms).toHaveBeenCalledTimes(2));
  expect(getCategorizedPrograms.mock.calls[1].slice(0, 2)).toEqual(["uk", "ENGLAND"]);
  await act(async () => pending.reject(new DOMException("Cancelled", "AbortError")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Calculated amount: 35000")).toBeTruthy();
  expect(new URLSearchParams(window.location.hash.slice(1)).get("country")).toBe("uk");
});

it("aborts an earlier submission on Save and does not replace a newer result with its late failure", async () => {
  const pending = deferred();
  getCategorizedPrograms.mockReturnValueOnce(pending.promise);
  render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  const firstSignal = getCategorizedPrograms.mock.calls[0][12].signal;
  const dialog = await edit();
  submitted = { ...submitted, headIncome: 50000 };
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes", exact: true }));
  expect(firstSignal.aborted).toBe(true);
  await screen.findByText("Calculated amount: 35000");
  await act(async () => pending.reject(new Error("Old response")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Calculated amount: 35000")).toBeTruthy();
  expect(getCategorizedPrograms.mock.calls[1][2]).toBe(50000);
});

it("cancels the active request when the app unmounts", () => {
  getCategorizedPrograms.mockReturnValueOnce(new Promise(() => {}));
  const { unmount } = render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  const signal = getCategorizedPrograms.mock.calls[0][12].signal;
  unmount();
  expect(signal.aborted).toBe(true);
});
