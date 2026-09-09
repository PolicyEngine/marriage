/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import InputForm from "../app/components/InputForm.jsx";
import MarriageApp, { encodeToHash, decodeFromHash } from "../app/MarriageApp.jsx";
import { childCareFormError, normalizeChildcareChild, childcareCounties } from "../app/components/USChildcareInputs.jsx";
import { COUNTRIES } from "../lib/countries.js";
import metadata from "../lib/childcare-metadata.json";
import { getCategorizedPrograms, getHeatmapData } from "../lib/api.js";

vi.mock("../lib/api.js", async (importOriginal) => ({
  ...await importOriginal(),
  getCategorizedPrograms: vi.fn(),
  getHeatmapData: vi.fn(),
}));

const baseData = {
  regionCode: "CA", headIncome: 15000, spouseIncome: 10000,
  headAge: 40, spouseAge: 40, children: [{ age: 3, isDisabled: false, childcareProviders: Object.fromEntries(metadata.states.CA.providers.map((p) => [p.variable, p.options[0].value])) }],
  disabilityStatus: {}, pregnancyStatus: {}, esiStatus: {}, year: "2026",
  ccdfSlotAvailable: true, childcareCounty: metadata.counties.CA[0].value,
  childcareWorkHours: { head: 40, spouse: 0 }, includeHeadStart: true,
};
const props = { section: "childcare", country: COUNTRIES.us, countryId: "us", loading: false, onCalculate: vi.fn() };
const scrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => { HTMLElement.prototype.scrollIntoView = scrollIntoView; });
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  getCategorizedPrograms.mockResolvedValue(null);
  getHeatmapData.mockResolvedValue(null);
});
afterEach(cleanup);

function openDetails() {}
async function choose(label, option) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

it("uses one SSI disability control per adult and preserves the existing API contract", () => {
  const onCalculate = vi.fn();
  render(<InputForm {...props} section="circumstances" initialValues={baseData} onCalculate={onCalculate} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "You meets SSI disability criteria" }));
  expect(screen.queryByRole("checkbox", { name: "You disabled" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onCalculate.mock.calls[0][0]).toMatchObject({ disabilityStatus: { head: true }, children: [{ isDisabled: false }], childcareWorkHours: { spouse: 0 } });
});

it("keeps US-specific controls out of UK circumstances", () => {
  render(<InputForm {...props} section="circumstances" country={COUNTRIES.uk} countryId="uk" />);
  expect(screen.getByRole("checkbox", { name: "You disabled" })).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: /SSI disability/ })).toBeNull();
  expect(screen.queryByLabelText("Your work hours / week")).toBeNull();
});

it("validates assistance inputs once paid care is entered", async () => {
  const onCalculate = vi.fn();
  render(<InputForm {...props} initialValues={{ children: [{ age: 3 }] }} onCalculate={onCalculate} />);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onCalculate).toHaveBeenCalledOnce();
  expect(screen.queryByRole("checkbox", { name: "Assume a funded childcare slot" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Child 1 annual childcare price ($)"), { target: { value: "12000" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("alert").textContent).toContain("Choose a county");
  await choose("Childcare county", metadata.counties.CA[0].label);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("alert").textContent).toContain("provider type");
  await choose("Child 1 provider type", metadata.states.CA.providers[0].options[0].label);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onCalculate).toHaveBeenCalledTimes(2);
  expect(onCalculate.mock.calls[1][0]).toMatchObject({ ccdfSlotAvailable: true, childcareCounty: metadata.counties.CA[0].value, childcareWorkHours: { head: 40, spouse: 40 }, children: [{ childcareCost: 12000, childcareHoursPerDay: 8, childcareDaysPerWeek: 5, childcareDaysPerMonth: 22 }] });
});

it("holds childcare edits in a draft until saving and preserves zero adult work hours", () => {
  const onCalculate = vi.fn();
  render(<InputForm {...props} initialValues={baseData} onCalculate={onCalculate} />);
  fireEvent.change(screen.getByLabelText("Child 1 annual childcare price ($)"), { target: { value: "10000" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Child 1 enrolled in Head Start or Early Head Start" }));
  expect(onCalculate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onCalculate.mock.calls[0][0]).toMatchObject({ childcareWorkHours: { spouse: 0 }, children: [{ isHeadStartEnrolled: true }] });
});

it("explains separate Head Start service values without an accounting toggle", () => {
  render(<InputForm {...props} initialValues={baseData} />);
  expect(screen.queryByRole("checkbox", { name: "Include Head Start service values" })).toBeNull();
  expect(screen.getByText(/service values appear separately from financial resources/)).toBeTruthy();
});

describe("childcare shares", () => {
  const careData = {
    ...baseData, disabilityStatus: { head: true, spouse: true }, livingArrangement: "cohabiting",
    children: [normalizeChildcareChild({
      age: 2, isDisabled: true, isHeadStartEnrolled: true,
      childcareProviders: baseData.children[0].childcareProviders,
      childcareCost: 15000, childcareHoursPerDay: 6, childcareDaysPerWeek: 4, childcareDaysPerMonth: 17,
    }, "CA")],
  };
  it("round-trips costs, providers, hours, enrollment, Head Start and existing disability flags", () => {
    const hash = encodeToHash("us", careData, false);
    window.history.replaceState(null, "", `#${hash}`);
    expect(decodeFromHash()).toMatchObject(careData);
  });
  it("keeps old disability links enabled without introducing paid childcare costs", () => {
    window.history.replaceState(null, "", "#region=CA&head=0&spouse=0&hd=1&sd=1&c=3:1");
    expect(decodeFromHash()).toMatchObject({ disabilityStatus: { head: true, spouse: true }, children: [{ isDisabled: true }], ccdfSlotAvailable: true, includeHeadStart: false });
  });
  it("forwards restored options to both scalar and grid requests", async () => {
    window.history.replaceState(null, "", `#${encodeToHash("us", careData, false)}`);
    render(<React.StrictMode><MarriageApp initialCountry="us" /></React.StrictMode>);
    await waitFor(() => expect(getHeatmapData).toHaveBeenCalledOnce());
    expect(getCategorizedPrograms.mock.calls[0][12]).toMatchObject({
      ccdfSlotAvailable: true, childcareCounty: careData.childcareCounty,
      childcareWorkHours: careData.childcareWorkHours, includeHeadStart: true,
    });
    expect(getHeatmapData.mock.calls[0][12]).toEqual(getCategorizedPrograms.mock.calls[0][12]);
    expect(getCategorizedPrograms.mock.calls[0][4]).toEqual(careData.children);
  });
});

it("rejects missing provider selections and impossible care hours without blocking zero-cost siblings", () => {
  const valid = normalizeChildcareChild({ age: 3, childcareCost: 10000, childcareProviders: baseData.children[0].childcareProviders }, "CA");
  const data = { ...baseData, children: [valid, normalizeChildcareChild({ age: 12 }, "CA")] };
  expect(childCareFormError(data)).toBeNull();
  expect(childCareFormError({ ...data, children: [{ ...valid, childcareHoursPerDay: 0 }] })).toContain("care hours");
  expect(childCareFormError({ ...data, children: [{ ...valid, childcareProviders: {} }] })).toContain("provider type");
});


it.each(["MD", "MA"])("requires an explicit provider selection in %s instead of applying the model default", (state) => {
  const child = normalizeChildcareChild({ age: 2, childcareCost: 10000 }, state);
  const data = { ...baseData, regionCode: state, childcareCounty: metadata.counties[state][0].value, children: [child] };
  expect(Object.values(child.childcareProviders)).toEqual([""]);
  expect(childCareFormError(data)).toContain("provider type");
  render(<InputForm {...props} initialValues={data} />);
  openDetails();
  expect(screen.getByRole("combobox", { name: "Child 1 provider type" }).textContent).toBe("Choose a provider type");
  expect(screen.queryByRole("combobox", { name: metadata.states[state].providers[0].label })).toBeNull();
});

it("labels Arkansas's schedule selection as care type", () => {
  render(<InputForm {...props} initialValues={{ ...baseData, regionCode: "AR", children: [{ age: 2, childcareCost: 1000 }] }} />);
  openDetails();
  expect(screen.getByRole("combobox", { name: "Child 1 care type" }).textContent).toBe("Choose a care type");
});


it("shows Nevada activity confirmation only for funded paid care", () => {
  const onCalculate = vi.fn();
  render(<InputForm {...props} onCalculate={onCalculate} initialValues={{ ...baseData, regionCode: "NV", childcareCounty: metadata.counties.NV[0].value, children: [{ age: 2, childcareCost: 1000 }] }} />);
  const option = screen.getByRole("checkbox", { name: "Meets childcare work or activity requirements" });
  expect(option.checked).toBe(false);
  fireEvent.click(option);
  expect(option.checked).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Assume a funded childcare slot" }));
  expect(screen.queryByRole("checkbox", { name: "Meets childcare work or activity requirements" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onCalculate.mock.calls[0][0].childcareActivityEligible).toBe(true);
});

it("round-trips Nevada's activity confirmation without applying it to other states", () => {
  const data = { ...baseData, regionCode: "NV", childcareActivityEligible: true };
  window.history.replaceState(null, "", `#${encodeToHash("us", data, false)}`);
  expect(decodeFromHash()).toMatchObject({ childcareActivityEligible: true });
  window.history.replaceState(null, "", `#${encodeToHash("us", { ...data, regionCode: "CA" }, false)}`);
  expect(new URLSearchParams(window.location.hash.slice(1)).has("cae")).toBe(false);
  expect(decodeFromHash()).toMatchObject({ childcareActivityEligible: false });
  window.history.replaceState(null, "", "#region=CA&head=0&spouse=0&cae=1");
  expect(decodeFromHash()).toMatchObject({ childcareActivityEligible: false });
});


it.each([0, 1.5, 32])("rejects invalid monthly attendance %s for a child with childcare costs", (days) => {
  const child = normalizeChildcareChild({ ...baseData.children[0], childcareCost: 10000, childcareDaysPerMonth: days }, "CA");
  expect(childCareFormError({ ...baseData, children: [child] })).toContain("whole-number care days per month");
});

it("accepts editable monthly attendance independently of weekly attendance", () => {
  const onCalculate = vi.fn();
  render(<InputForm {...props} initialValues={baseData} onCalculate={onCalculate} />);
  openDetails();
  fireEvent.change(screen.getByLabelText("Child 1 annual childcare price ($)"), { target: { value: "10000" } });
  fireEvent.change(screen.getByLabelText("Child 1 care days / month"), { target: { value: "17" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onCalculate.mock.calls[0][0].children[0]).toMatchObject({ childcareDaysPerWeek: 5, childcareDaysPerMonth: 17 });
});


it("keeps paid costs, county, and work hours visible and preserved without a funded slot", () => {
  const onCalculate = vi.fn();
  render(<InputForm {...props} initialValues={baseData} onCalculate={onCalculate} />);
  openDetails();
  fireEvent.change(screen.getByLabelText("Child 1 annual childcare price ($)"), { target: { value: "10000" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Assume a funded childcare slot" }));
  expect(screen.getByRole("combobox", { name: "Childcare county" }).textContent).toBe(metadata.counties.CA[0].label);
  expect(screen.getByLabelText("Child 1 annual childcare price ($)").value).toBe("10000");
  expect(screen.queryByLabelText("Partner’s work hours / week")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onCalculate.mock.calls[0][0]).toMatchObject({
    ccdfSlotAvailable: false, childcareCounty: baseData.childcareCounty,
    children: [{ childcareCost: 10000 }], childcareWorkHours: { spouse: 0 },
  });
});

it("allows paid care with no county or provider when a funded slot is unavailable", () => {
  const child = normalizeChildcareChild({ age: 2, childcareCost: 10000 }, "CA");
  const data = { ...baseData, ccdfSlotAvailable: false, childcareCounty: "", children: [child] };
  expect(childCareFormError(data)).toBeNull();
  const onCalculate = vi.fn();
  render(<InputForm {...props} initialValues={data} onCalculate={onCalculate} />);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onCalculate).toHaveBeenCalledOnce();
});

it("keeps a retained county editable without children", () => {
  render(<InputForm {...props} initialValues={{ ...baseData, children: [] }} />);
  expect(screen.getByRole("combobox", { name: "Childcare county" }).textContent).toBe(metadata.counties.CA[0].label);
  expect(screen.queryByLabelText("Child 1 annual childcare price ($)")).toBeNull();
});

it("limits New York City county choices and validation to the five boroughs", async () => {
  const counties = childcareCounties("NYC");
  expect(counties.map((county) => county.value).sort()).toEqual([
    "BRONX_COUNTY_NY", "KINGS_COUNTY_NY", "NEW_YORK_COUNTY_NY", "QUEENS_COUNTY_NY", "RICHMOND_COUNTY_NY",
  ]);
  const data = { ...baseData, regionCode: "NYC", childcareCounty: "ALBANY_COUNTY_NY", ccdfSlotAvailable: false };
  expect(childCareFormError(data)).toContain("Choose a county");
  expect(childCareFormError({ ...data, childcareCounty: "KINGS_COUNTY_NY" })).toBeNull();
  render(<InputForm {...props} initialValues={{ ...data, childcareCounty: "", children: [{ age: 3, childcareCost: 1000 }] }} />);
  openDetails();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Childcare county" }), { key: "ArrowDown" });
  await screen.findByRole("option", { name: counties[0].label });
  expect(screen.queryByRole("option", { name: "Albany County, NY" })).toBeNull();
  expect(screen.getAllByRole("option")).toHaveLength(6);
});

it("shares an unavailable funded slot while preserving care costs and accepts old CCDF links", () => {
  const data = { ...baseData, ccdfSlotAvailable: false, children: [{ ...baseData.children[0], childcareCost: 10000 }] };
  const hash = encodeToHash("us", data, false);
  expect(new URLSearchParams(hash).get("ccdf_slot")).toBe("0");
  expect(new URLSearchParams(hash).has("ccdf")).toBe(false);
  window.history.replaceState(null, "", `#${hash}`);
  expect(decodeFromHash()).toMatchObject(data);
  expect(new URLSearchParams(encodeToHash("us", baseData, false)).has("ccdf_slot")).toBe(false);
  window.history.replaceState(null, "", "#region=CA&head=0&spouse=0&ccdf=1");
  expect(decodeFromHash()).toMatchObject({ ccdfSlotAvailable: true });
});


it("exposes work hours independently of childcare and preserves zero on submission", () => {
  const onCalculate = vi.fn();
  render(<InputForm {...props} section="work" onCalculate={onCalculate} />);
  expect(screen.getByLabelText("Your work hours / week").value).toBe("40");
  expect(screen.getByLabelText("Partner’s work hours / week").value).toBe("40");
  expect(screen.queryByLabelText("Child 1 annual childcare price ($)")).toBeNull();
  fireEvent.change(screen.getByLabelText("Your work hours / week"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Partner’s work hours / week"), { target: { value: "0" } });
  expect(onCalculate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onCalculate.mock.calls[0][0]).toMatchObject({ children: [], childcareWorkHours: { head: 0, spouse: 0 }, ccdfSlotAvailable: true });
});
