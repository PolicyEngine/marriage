import React from "react";
import childcareMetadata from "@/lib/childcare-metadata.json";
import FormSelect from "./FormSelect";

const stateCode = (region) => region === "NYC" ? "NY" : region;
const NYC_COUNTIES = new Set(["BRONX_COUNTY_NY", "KINGS_COUNTY_NY", "NEW_YORK_COUNTY_NY", "QUEENS_COUNTY_NY", "RICHMOND_COUNTY_NY"]);
export function childcareCounties(region) {
  const counties = childcareMetadata.counties[stateCode(region)] || [];
  return region === "NYC" ? counties.filter((county) => NYC_COUNTIES.has(county.value)) : counties;
}
const nonnegative = (value, fallback = 0) => {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
};

export function normalizeChildcareChild(child, regionCode) {
  const providers = childcareMetadata.states[stateCode(regionCode)]?.providers || [];
  return {
    ...child,
    isHeadStartEnrolled: child.isHeadStartEnrolled || false,
    childcareCost: nonnegative(child.childcareCost),
    childcareHoursPerDay: nonnegative(child.childcareHoursPerDay, 8),
    childcareDaysPerWeek: nonnegative(child.childcareDaysPerWeek, 5),
    childcareDaysPerMonth: nonnegative(child.childcareDaysPerMonth, 22),
    childcareProviders: Object.fromEntries(providers.map((provider) => [
      provider.variable,
      child.childcareProviders?.[provider.variable] ?? "",
    ])),
  };
}

export function childCareFormError(data) {
  const state = stateCode(data.regionCode);
  const paidCare = data.children.filter((child) => child.childcareCost > 0);
  const fundedCare = paidCare.length > 0 && data.ccdfSlotAvailable !== false;
  if ((fundedCare || data.childcareCounty) && !childcareCounties(data.regionCode).some((county) => county.value === data.childcareCounty)) {
    return "Choose a county for the childcare estimate.";
  }
  const providers = childcareMetadata.states[state]?.providers || [];
  for (const child of paidCare) {
    if (!(child.childcareHoursPerDay > 0 && child.childcareHoursPerDay <= 24 && child.childcareDaysPerWeek > 0 && child.childcareDaysPerWeek <= 7)) {
      return "Enter care hours per day (up to 24) and days per week (up to 7) for each child with childcare costs.";
    }
    if (!Number.isInteger(child.childcareDaysPerMonth) || child.childcareDaysPerMonth < 1 || child.childcareDaysPerMonth > 31) {
      return "Enter whole-number care days per month between 1 and 31 for each child with childcare costs.";
    }
    if (fundedCare && providers.some((provider) => !provider.options.some((option) => option.value === child.childcareProviders[provider.variable]))) {
      return "Choose a childcare provider type for each child with childcare costs.";
    }
  }
  if ([data.childcareWorkHours.head, data.childcareWorkHours.spouse].some((hours) => !Number.isFinite(Number(hours)) || Number(hours) < 0 || Number(hours) > 168)) {
    return "Enter weekly work hours between 0 and 168 for each adult.";
  }
  return null;
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="sf-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
      {label}
    </label>
  );
}

function NumberField({ id, label, value, onChange, max, step = "any" }) {
  return (
    <div className="sf-field sf-grow">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min="0" max={max} step={step} value={value}
        onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} />
    </div>
  );
}

export default function USChildcareInputs({
  regionCode, childEntries, updateChild, ccdfSlotAvailable, onCcdfSlotAvailableChange,
  childcareCounty, onCountyChange, childcareWorkHours, onWorkHoursChange,
  includeHeadStart, onIncludeHeadStartChange, childcareActivityEligible, onActivityEligibleChange, error,
}) {
  const state = stateCode(regionCode);
  const counties = childcareCounties(regionCode);
  const providers = childcareMetadata.states[state]?.providers || [];
  const paidCare = childEntries.some((child) => Number(child.childcareCost) > 0);
  const providerLabel = (index) => state === "AR" ? "Care type" : `Provider type${providers.length > 1 ? ` ${index + 1}` : ""}`;
  return (
    <div className="sf-group sf-us-childcare">
      <div className="sf-group-title">Work, childcare and early learning</div>
      <p className="sf-input-note">Weekly work hours default to 40 for each adult. Adjust these to match your work schedule. They stay fixed across the income grid and may affect other benefits as well as childcare assistance.</p>
      <div className="sf-row">
        <NumberField id="childcare-work-head" label="Your work hours / week" max="168"
          value={childcareWorkHours.head} onChange={(head) => onWorkHoursChange({ ...childcareWorkHours, head })} />
        <NumberField id="childcare-work-spouse" label="Partner’s work hours / week" max="168"
          value={childcareWorkHours.spouse} onChange={(spouse) => onWorkHoursChange({ ...childcareWorkHours, spouse })} />
      </div>

      <Toggle label="Assume a funded childcare slot" checked={ccdfSlotAvailable} onChange={onCcdfSlotAvailableChange} />
      <p className="sf-input-note">Assumes a funded place is available if you otherwise qualify for childcare assistance, rather than being on a waiting list. Without a funded slot, you still pay the childcare costs entered.</p>
      {(childEntries.length > 0 || childcareCounty) && (
        <div className="sf-childcare-fields">
          {(childEntries.length > 0 || childcareCounty) && <div className="sf-field">
            <label htmlFor="childcare-county">County</label>
            <FormSelect id="childcare-county" label="Childcare county"
              value={childcareCounty || "__choose__"}
              onValueChange={(value) => onCountyChange(value === "__choose__" ? "" : value)}
              options={[{ value: "__choose__", label: "Choose a county" }, ...counties]} />
          </div>}

          {state === "NV" && paidCare && ccdfSlotAvailable && (
            <div>
              <Toggle label="Meets childcare work or activity requirements"
                checked={childcareActivityEligible || false} onChange={onActivityEligibleChange} />
              <p className="sf-input-note">All parents must meet Nevada’s work or approved education or training requirements. Entering work hours does not confirm that these rules are met.</p>
            </div>
          )}
          {childEntries.length > 0 && <p className="sf-input-note">Enter annual prices before subsidies for paid care, including paid care outside Head Start hours. Exclude free Head Start and Early Head Start hours and costs.</p>}
          {childEntries.map((child, index) => (
            <fieldset className="sf-childcare-child" key={index}>
              <legend>Child {index + 1}</legend>
              <NumberField id={`childcare-cost-${index}`} label={`Child ${index + 1} annual childcare price ($)`}
                value={child.childcareCost ?? 0} onChange={(value) => updateChild(index, "childcareCost", value)} />
              <div className="sf-row">
                <NumberField id={`childcare-hours-${index}`} label={`Child ${index + 1} care hours / day`} max="24"
                  value={child.childcareHoursPerDay ?? 8} onChange={(value) => updateChild(index, "childcareHoursPerDay", value)} />
                <NumberField id={`childcare-days-${index}`} label={`Child ${index + 1} care days / week`} max="7"
                  value={child.childcareDaysPerWeek ?? 5} onChange={(value) => updateChild(index, "childcareDaysPerWeek", value)} />
              </div>
              <NumberField id={`childcare-month-days-${index}`} label={`Child ${index + 1} care days / month`} max="31" step="1"
                value={child.childcareDaysPerMonth ?? 22} onChange={(value) => updateChild(index, "childcareDaysPerMonth", value)} />
              <p className="sf-input-note">Monthly attendance defaults to 22 days for year-round care. Adjust it to match your child’s schedule.</p>
              {providers.map((provider, providerIndex) => (
                <div className="sf-field" key={provider.variable}>
                  <label htmlFor={`childcare-provider-${index}-${provider.variable}`}>{providerLabel(providerIndex)}</label>
                  <FormSelect id={`childcare-provider-${index}-${provider.variable}`}
                    label={`Child ${index + 1} ${providerLabel(providerIndex).toLowerCase()}`}
                    value={child.childcareProviders?.[provider.variable] || "__choose__"}
                    onValueChange={(value) => updateChild(index, "childcareProviders", {
                      ...child.childcareProviders, [provider.variable]: value === "__choose__" ? "" : value,
                    })}
                    options={[{ value: "__choose__", label: state === "AR" ? "Choose a care type" : "Choose a provider type" }, ...provider.options]} />
                </div>
              ))}
              <Toggle label={`Child ${index + 1} enrolled in Head Start or Early Head Start`}
                checked={child.isHeadStartEnrolled || false} onChange={(value) => updateChild(index, "isHeadStartEnrolled", value)} />
            </fieldset>
          ))}
        </div>
      )}
      <Toggle label="Include Head Start service values" checked={includeHeadStart} onChange={onIncludeHeadStartChange} />
      <p className="sf-input-note">Includes modeled Head Start and Early Head Start service values for eligible enrollment. These are in-kind services, not cash payments or guaranteed places.</p>
      {error && <p role="alert" className="sf-childcare-error">{error}</p>}
    </div>
  );
}
