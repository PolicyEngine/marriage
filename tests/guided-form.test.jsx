/** @vitest-environment jsdom */
import React from "react";
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import InputForm from "../app/components/InputForm.jsx";
import { getInputSections } from "../lib/inputSections.js";
import { COUNTRIES } from "../lib/countries.js";
import metadata from "../lib/childcare-metadata.json";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScrollIntoView; });
afterEach(cleanup);
const props = (overrides = {}) => ({ country: COUNTRIES.us, countryId: "us", loading: false, onCalculate: vi.fn(), ...overrides });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue", exact: true }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes", exact: true }));
async function choose(label, option) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("focused household journey", () => {
  it("uses four childless US questions, with work separate from health and no full form escape", () => {
    const formProps = props();
    const { container } = render(<InputForm {...formProps} />);
    expect(screen.getByRole("heading", { name: "What would you like to compare?" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026");
    expect(screen.getByRole("radio", { name: /^Living together/ }).checked).toBe(true);
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "You income" })).toBeNull();
    fireEvent.submit(container.querySelector("form"));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Who is in your household?" }));
    expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("45,000");
    expect(screen.getByRole("spinbutton", { name: "You age" }).value).toBe("40");
    next();
    expect(screen.getByRole("checkbox", { name: "You meets SSI disability criteria" }).checked).toBe(false);
    expect(screen.queryByLabelText("Your work hours / week")).toBeNull();
    next();
    expect(screen.queryByRole("checkbox", { name: /SSI disability/ })).toBeNull();
    expect(screen.getByLabelText("Your work hours / week").value).toBe("40");
    expect(screen.queryByRole("checkbox", { name: "Assume a funded childcare slot" })).toBeNull();
    expect(screen.queryByText("Use full form")).toBeNull();
    expect(screen.queryByText("More details")).toBeNull();
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Your work hours / week"), { target: { value: "0" } });
    fireEvent.submit(container.querySelector("form"));
    expect(formProps.onCalculate).toHaveBeenCalledOnce();
    expect(formProps.onCalculate.mock.calls[0][0]).toMatchObject({ livingArrangement: "cohabiting", headIncome: 45000, spouseIncome: 45000, headAge: 40, spouseAge: 40, children: [], childcareWorkHours: { head: 0, spouse: 40 }, ccdfSlotAvailable: true });
  });

  it("retains answers on Back and reveals an additional childcare question after adding a child", () => {
    render(<InputForm {...props()} />);
    next();
    fireEvent.change(screen.getByRole("textbox", { name: "You income" }), { target: { value: "18000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));
    fireEvent.change(screen.getByLabelText("Child 1 age"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Child 1 meets SSI disability criteria" }));
    expect(screen.getByText("Step 2 of 5")).toBeTruthy();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Child 1 age").value).toBe("0");
    expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("18000");
    expect(screen.getByRole("checkbox", { name: "Child 1 meets SSI disability criteria" }).checked).toBe(true);
    next(); next(); next();
    expect(screen.getByRole("heading", { name: "Do you pay for childcare?" })).toBeTruthy();
    expect(screen.queryByLabelText("Your work hours / week")).toBeNull();
  });

  it.each(["", "17", "101", "35.5"])("blocks invalid adult age %j without silently replacing it", (value) => {
    const formProps = props({ section: "household" });
    render(<InputForm {...formProps} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "You age" }), { target: { value } });
    fireEvent.blur(screen.getByRole("spinbutton", { name: "You age" }));
    save();
    expect(document.activeElement).toBe(screen.getByRole("alert"));
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "You age" }), { target: { value: "18" } });
    save();
    expect(formProps.onCalculate.mock.calls[0][0].headAge).toBe(18);
  });

  it.each(["", "-1", "19", "2.5"])("requires valid whole-year child age %j and accepts a newborn", (value) => {
    render(<InputForm {...props()} />);
    next();
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));
    fireEvent.change(screen.getByLabelText("Child 1 age"), { target: { value } });
    next();
    expect(screen.getByRole("alert").textContent).toContain("children 0–18");
    fireEvent.change(screen.getByLabelText("Child 1 age"), { target: { value: "0" } });
    next();
    expect(screen.getByRole("heading", { name: "Do any of these apply?" })).toBeTruthy();
  });

  it("opens exactly one edit topic, preserves unrelated fields, and lets Cancel bypass validation", () => {
    const formProps = props({ section: "work", onCancel: vi.fn(), initialValues: { headIncome: 18000, headAge: 55, disabilityStatus: { head: true }, children: [{ age: 2 }] } });
    render(<InputForm {...formProps} />);
    expect(screen.queryByLabelText("You income")).toBeNull();
    expect(screen.queryByLabelText("Child 1 age")).toBeNull();
    fireEvent.change(screen.getByLabelText("Your work hours / week"), { target: { value: "169" } });
    save();
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(formProps.onCancel).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Your work hours / week"), { target: { value: "0" } });
    save();
    expect(formProps.onCalculate.mock.calls[0][0]).toMatchObject({ headIncome: 18000, headAge: 55, disabilityStatus: { head: true }, children: [{ age: 2 }], childcareWorkHours: { head: 0 } });
  });

  it("routes a state edit with retained paid care to visible childcare follow-ups", async () => {
    const formProps = props({ section: "comparison", initialValues: { regionCode: "CA", childcareCounty: metadata.counties.CA[0].value, children: [{ age: 3, childcareCost: 12000 }] } });
    render(<InputForm {...formProps} />);
    await choose("State", "Colorado");
    next();
    expect(screen.getByRole("heading", { name: "Do you pay for childcare?" })).toBeTruthy();
    expect(screen.getByLabelText("Child 1 annual childcare price ($)").value).toBe("12000");
    expect(screen.getByRole("combobox", { name: "Childcare county" }).textContent).toBe("Choose a county");
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Assume a funded childcare slot" }));
    save();
    expect(formProps.onCalculate.mock.calls[0][0]).toMatchObject({ regionCode: "CO", childcareCounty: "", children: [{ childcareCost: 12000 }] });
  });

  it("routes added children to care questions before committing a household edit", () => {
    const formProps = props({ section: "household", initialValues: { children: [] } });
    render(<InputForm {...formProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));
    next();
    expect(screen.getByLabelText("Child 1 annual childcare price ($)").value).toBe("0");
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    save();
    expect(formProps.onCalculate.mock.calls[0][0].children).toHaveLength(1);
  });

  it("reveals paid-care inputs only after a cost is entered and focuses visible validation", () => {
    const formProps = props({ section: "childcare", initialValues: { children: [{ age: 3 }] } });
    render(<InputForm {...formProps} />);
    expect(screen.queryByLabelText("Child 1 care hours / day")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Childcare county" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Child 1 annual childcare price ($)"), { target: { value: "10000" } });
    expect(screen.getByLabelText("Child 1 care hours / day").value).toBe("8");
    save();
    expect(screen.getByRole("alert").textContent).toContain("Choose a county");
    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });

  it("separates UK health, housing and other finances and omits US-only questions", () => {
    const formProps = props({ country: COUNTRIES.uk, countryId: "uk" });
    render(<InputForm {...formProps} />);
    expect(screen.getByText(/UK benefits generally assess couples who live together/)).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026-27");
    next(); next();
    expect(screen.getByRole("checkbox", { name: "You disabled" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Savings" })).toBeNull();
    expect(screen.queryByLabelText("Your work hours / week")).toBeNull();
    next();
    expect(screen.getByRole("combobox", { name: "Tenure" }).textContent).toBe("Owned outright");
    expect(screen.queryByRole("textbox", { name: "You self-employment income" })).toBeNull();
    next();
    expect(screen.getByRole("textbox", { name: "Savings" }).value).toBe("0");
    expect(screen.getByRole("textbox", { name: "You self-employment income" }).value).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(formProps.onCalculate.mock.calls[0][0]).toMatchObject({ livingArrangement: "separate", rent: 0, savings: 0 });
  });

  it("preserves supplied adult ages when editing the country", () => {
    const formProps = props({ section: "comparison", initialValues: { headAge: 63, spouseAge: 61 } });
    const { rerender } = render(<InputForm {...formProps} />);
    rerender(<InputForm {...formProps} country={COUNTRIES.uk} countryId="uk" />);
    save();
    expect(formProps.onCalculate.mock.calls[0][0]).toMatchObject({ headAge: 63, spouseAge: 61, regionCode: COUNTRIES.uk.defaultRegion });
  });

  it("uses country age defaults only before household answers have been entered", () => {
    const formProps = props();
    const { rerender } = render(<InputForm {...formProps} />);
    rerender(<InputForm {...formProps} country={COUNTRIES.uk} countryId="uk" />);
    next();
    expect(screen.getByLabelText("You age").value).toBe("35");
    fireEvent.change(screen.getByLabelText("You age"), { target: { value: "63" } });
    fireEvent.change(screen.getByLabelText("Your partner age"), { target: { value: "61" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    rerender(<InputForm {...formProps} />);
    next();
    expect(screen.getByLabelText("You age").value).toBe("63");
    expect(screen.getByLabelText("Your partner age").value).toBe("61");
  });

  it("scrolls to setup progress only after a step change and never scrolls editor mounts or follow-ups", () => {
    HTMLElement.prototype.scrollIntoView.mockClear();
    const { container, unmount } = render(<React.StrictMode><InputForm {...props()} /></React.StrictMode>);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    next();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledOnce();
    expect(HTMLElement.prototype.scrollIntoView.mock.instances[0]).toBe(container.querySelector("form"));
    unmount();
    HTMLElement.prototype.scrollIntoView.mockClear();
    render(<InputForm {...props({ section: "household", initialValues: { children: [] } })} />);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));
    next();
    expect(screen.getByRole("heading", { name: "Do you pay for childcare?" })).toBeTruthy();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps retained county and UK care costs discoverable without children", () => {
    expect(getInputSections(COUNTRIES.us, { childcareCounty: "LOS_ANGELES_COUNTY_CA" }).map((item) => item.id)).toContain("childcare");
    expect(getInputSections(COUNTRIES.uk, { childcareCosts: 1200 }).map((item) => item.id)).toContain("childcare");
    expect(getInputSections(COUNTRIES.uk, {}).map((item) => item.id)).toEqual(["comparison", "household", "circumstances", "housing", "finances"]);
  });
});
