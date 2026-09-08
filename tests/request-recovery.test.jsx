/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MarriageApp from "../app/MarriageApp.jsx";
import { getCategorizedPrograms, getHeatmapData } from "../lib/api.js";

let submitted;
vi.mock("../lib/api.js", () => ({ getCategorizedPrograms: vi.fn(), getHeatmapData: vi.fn() }));
vi.mock("../app/components/InputForm.jsx", () => ({
  default: ({ onCalculate, onInputChange, onCountryChange }) => <div>
    <button onClick={() => onCalculate(submitted)}>Submit inputs</button>
    <button onClick={onInputChange}>Change inputs</button>
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

it("aborts a scalar request on input changes and ignores its late result", async () => {
  const pending = deferred();
  getCategorizedPrograms.mockReturnValueOnce(pending.promise);
  render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  const signal = getCategorizedPrograms.mock.calls[0][12].signal;
  fireEvent.click(screen.getByRole("button", { name: "Change inputs" }));
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ amount: 111 }));
  expect(screen.queryByText("Calculated amount: 111")).toBeNull();
  expect(getHeatmapData).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("cancels a pending heatmap when the country changes without showing an obsolete error", async () => {
  const pending = deferred();
  getHeatmapData.mockReturnValueOnce(pending.promise);
  render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  await waitFor(() => expect(getHeatmapData).toHaveBeenCalledOnce());
  const signal = getHeatmapData.mock.calls[0][12].signal;
  fireEvent.click(screen.getByRole("button", { name: "Switch country" }));
  expect(signal.aborted).toBe(true);
  await act(async () => pending.reject(new DOMException("Cancelled", "AbortError")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("Calculated amount: 35000")).toBeNull();
});

it("aborts an earlier submission and does not replace a newer result with its late failure", async () => {
  const pending = deferred();
  getCategorizedPrograms.mockReturnValueOnce(pending.promise);
  render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  const firstSignal = getCategorizedPrograms.mock.calls[0][12].signal;
  submitted = { ...submitted, headIncome: 50000 };
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  expect(firstSignal.aborted).toBe(true);
  await screen.findByText("Calculated amount: 35000");
  await act(async () => pending.reject(new Error("Old response")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Calculated amount: 35000")).toBeTruthy();
});

it("cancels the active request when the app unmounts", () => {
  getCategorizedPrograms.mockReturnValueOnce(new Promise(() => {}));
  const { unmount } = render(<MarriageApp initialCountry="us" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit inputs" }));
  const signal = getCategorizedPrograms.mock.calls[0][12].signal;
  unmount();
  expect(signal.aborted).toBe(true);
});
