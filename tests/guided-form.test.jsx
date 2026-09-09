/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import InputForm from "../app/components/InputForm.jsx";
import { COUNTRIES } from "../lib/countries.js";

afterEach(cleanup);

function props(overrides = {}) {
  return { country: COUNTRIES.us, countryId: "us", mode: "wizard", loading: false, onCalculate: vi.fn(), ...overrides };
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("guided household form", () => {
  it("advances form submission through focused steps without calculating early", () => {
    const formProps = props();
    const { container } = render(<InputForm {...formProps} />);
    expect(screen.getByRole("heading", { name: "Choose your comparison" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026");
    expect(screen.getByText(/sharing a home, food and resources/)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "You income" })).toBeNull();
    // Enter uses the form's submit event, just like the Continue button.
    fireEvent.submit(container.querySelector("form"));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Describe your household" }));
    expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("45,000");
    expect(screen.getByRole("spinbutton", { name: "You age" }).value).toBe("40");
    expect(screen.getByText(/No children included/)).toBeTruthy();
    fireEvent.submit(container.querySelector("form"));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Add relevant details" }));
    expect(screen.getByRole("checkbox", { name: "You meets SSI disability criteria" }).checked).toBe(false);
    expect(screen.getByLabelText("Your work hours / week").value).toBe("40");
    expect(screen.queryByRole("checkbox", { name: "Assume a funded childcare slot" })).toBeNull();
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Your work hours / week"), { target: { value: "0" } });
    fireEvent.submit(container.querySelector("form"));
    expect(formProps.onCalculate).toHaveBeenCalledOnce();
    expect(formProps.onCalculate.mock.calls[0][0]).toMatchObject({
      livingArrangement: "cohabiting", headIncome: 45000, spouseIncome: 45000,
      headAge: 40, spouseAge: 40, children: [], childcareWorkHours: { head: 0, spouse: 40 }, ccdfSlotAvailable: true,
    });
  });

  it("preserves adult and child values through Back and a switch to the full form", () => {
    const formProps = props({ onExitWizard: vi.fn() });
    const { rerender } = render(<InputForm {...formProps} />);
    next();
    fireEvent.change(screen.getByRole("textbox", { name: "You income" }), { target: { value: "18000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));
    fireEvent.change(screen.getByLabelText("Child 1 age"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Child 1 meets SSI disability criteria" }));
    expect(screen.getByText(/All children are assumed to be both adults’ children/)).toBeTruthy();
    expect(screen.getByText(/more than half the cost of keeping up the home/)).toBeTruthy();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Child 1 age").value).toBe("0");
    expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("18000");
    fireEvent.click(screen.getByRole("button", { name: "Use full form" }));
    expect(formProps.onExitWizard).toHaveBeenCalledOnce();
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    rerender(<InputForm {...formProps} mode="editor" />);
    expect(screen.getByRole("textbox", { name: "You income" }).value).toBe("18000");
    fireEvent.click(screen.getByText("More details"));
    expect(screen.getByLabelText("Child 1 age").value).toBe("0");
    expect(screen.getByRole("checkbox", { name: "Child 1 meets SSI disability criteria" }).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(formProps.onCalculate.mock.calls[0][0]).toMatchObject({ headIncome: 18000, children: [{ age: 0, isDisabled: true }] });
  });

  it.each(["", "17", "101", "35.5"])("blocks an invalid adult age %j on Continue and Enter submission", (value) => {
    const formProps = props();
    const { container } = render(<InputForm {...formProps} />);
    next();
    fireEvent.change(screen.getByRole("spinbutton", { name: "You age" }), { target: { value } });
    fireEvent.blur(screen.getByRole("spinbutton", { name: "You age" }));
    fireEvent.submit(container.querySelector("form"));
    expect(screen.getByRole("heading", { name: "Describe your household" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("alert"));
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "You age" }), { target: { value: "18" } });
    next();
    expect(screen.getByRole("heading", { name: "Add relevant details" })).toBeTruthy();
  });

  it("requires a valid child age while accepting a newborn", () => {
    render(<InputForm {...props()} />);
    next();
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));
    fireEvent.change(screen.getByLabelText("Child 1 age"), { target: { value: "" } });
    next();
    expect(screen.getByRole("alert").textContent).toContain("children 0–18");
    fireEvent.change(screen.getByLabelText("Child 1 age"), { target: { value: "0" } });
    next();
    expect(screen.getByRole("heading", { name: "Add relevant details" })).toBeTruthy();
  });

  it("focuses childcare validation in the visible final step and allows correction", () => {
    const formProps = props({ initialValues: { children: [{ age: 3 }] } });
    render(<InputForm {...formProps} />);
    next();
    next();
    fireEvent.change(screen.getByLabelText("Child 1 annual childcare price ($)"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose a county");
    expect(document.activeElement).toBe(screen.getByRole("alert"));
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Assume a funded childcare slot" }));
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(formProps.onCalculate.mock.calls[0][0]).toMatchObject({ ccdfSlotAvailable: false, children: [{ childcareCost: 10000 }] });
  });

  it("reveals childcare follow-ups only when paid care is entered", () => {
    render(<InputForm {...props({ initialValues: { children: [{ age: 3 }] } })} />);
    next();
    next();
    expect(screen.getByLabelText("Child 1 annual childcare price ($)").value).toBe("0");
    expect(screen.getByRole("checkbox", { name: "Child 1 enrolled in Head Start or Early Head Start" })).toBeTruthy();
    expect(screen.queryByLabelText("Child 1 care hours / day")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Childcare county" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Assume a funded childcare slot" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Child 1 annual childcare price ($)"), { target: { value: "10000" } });
    expect(screen.getByLabelText("Child 1 care hours / day").value).toBe("8");
    expect(screen.getByRole("combobox", { name: "Childcare county" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Child 1 provider type" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Assume a funded childcare slot" }).checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Child 1 annual childcare price ($)"), { target: { value: "0" } });
    expect(screen.queryByLabelText("Child 1 care hours / day")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Childcare county" })).toBeNull();
  });

  it.each([
    ["Your work hours / week", "169"],
    ["Child 1 care hours / day", "25"],
    ["Child 1 care days / month", "32"],
  ])("retains native numeric constraints for %s on final submission", (label, value) => {
    const formProps = props({ initialValues: { children: [{ age: 3, childcareCost: 10000 }], ccdfSlotAvailable: false } });
    render(<InputForm {...formProps} />);
    next();
    next();
    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value } });
    expect(input.validity.rangeOverflow).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(formProps.onCalculate).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Add relevant details" })).toBeTruthy();
  });

  it("focuses the current step when returning from the full form", () => {
    const formProps = props();
    const { rerender } = render(<InputForm {...formProps} />);
    next();
    rerender(<InputForm {...formProps} mode="editor" />);
    rerender(<InputForm {...formProps} mode="wizard" />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Describe your household" }));
  });

  it("shows the UK comparison and relevant defaults without US-only questions", () => {
    const formProps = props({ country: COUNTRIES.uk, countryId: "uk" });
    render(<InputForm {...formProps} />);
    expect(screen.getByText(/UK benefits generally assess couples who live together/)).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("2026-27");
    expect(screen.queryByRole("combobox", { name: "Unmarried living arrangement" })).toBeNull();
    next();
    expect(screen.getByRole("spinbutton", { name: "You age" }).value).toBe("35");
    next();
    expect(screen.getByRole("combobox", { name: "Tenure" }).textContent).toBe("Owned outright");
    expect(screen.getByRole("textbox", { name: "Savings" }).value).toBe("0");
    expect(screen.queryByRole("textbox", { name: "Annual childcare costs" })).toBeNull();
    expect(screen.queryByLabelText("Your work hours / week")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /SSI disability/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(formProps.onCalculate.mock.calls[0][0]).toMatchObject({ livingArrangement: "separate", rent: 0, savings: 0 });
  });
});
