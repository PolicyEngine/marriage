import metadata from "./childcare-metadata.json";

export const US_CHILDCARE_OUTPUTS = [
  { variable: "is_head_start_eligible", entity: "person" },
  { variable: "is_early_head_start_eligible", entity: "person" },
  { variable: "childcare_expenses", entity: "spm_unit" },
  { variable: "vt_ccfap_family_share", entity: "spm_unit" },
];

// These are presentation series derived from real model outputs, never inputs.
export const US_CHILDCARE_SERIES = [
  "childcare_gross_cost", "childcare_out_of_pocket", "childcare_cost_deducted",
  "childcare_provider_payment", "childcare_family_share",
  "head_start_service_value", "early_head_start_service_value",
];
const NYC_COUNTIES = new Set(["BRONX_COUNTY_NY", "KINGS_COUNTY_NY", "NEW_YORK_COUNTY_NY", "QUEENS_COUNTY_NY", "RICHMOND_COUNTY_NY"]);

export function grossChildcareCost(children = []) {
  return children.reduce((sum, child) => sum + Math.max(0, Number(child.childcareCost) || 0), 0);
}

export function addUSChildcareInputs(situation, children, year, extras = {}) {
  const enabled = grossChildcareCost(children) > 0 && extras.ccdfSlotAvailable !== false;
  const household = situation.households["your household"];
  const state = household.state_name[year];
  const config = metadata.states[state];
  const spm = situation.spm_units["your spm_unit"];
  if (enabled || extras.childcareCounty) {
    if (!metadata.counties[state]?.some(c => c.value === extras.childcareCounty)
      || (household.in_nyc?.[year] && !NYC_COUNTIES.has(extras.childcareCounty))) {
      throw new Error("Choose a county for the childcare calculation.");
    }
    household.county = { [year]: extras.childcareCounty };
  }
  spm.spm_unit_pre_subsidy_childcare_expenses = { [year]: grossChildcareCost(children, extras) };
  if (enabled && state === "NV") {
    // Nevada models activity as an explicit input. Other states calculate it
    // from work and earnings, so this must not override their own tests.
    spm.meets_ccdf_activity_test = { [year]: Boolean(extras.childcareActivityEligible) };
  }
  for (const [name, person] of Object.entries(situation.people)) {
    // General disability is also set because SSI's medical criteria imply the
    // broader disability assumption used elsewhere in this calculator.
    person.meets_ssi_disability_criteria = { [year]: person.is_disabled?.[year] || false };
    person.pre_subsidy_childcare_expenses = { [year]: 0 };
    if (extras.childcareWorkHours && (name === "you" || name === "your partner")) {
      const who = name === "you" ? "head" : "spouse";
      person.weekly_hours_worked_before_lsr = { [year]: extras.childcareWorkHours?.[who] ?? 40 };
    }
  }
  children.forEach((child, index) => {
    const person = situation.people[`child_${index + 1}`];
    const cost = Math.max(0, Number(child.childcareCost) || 0);
    const hours = cost ? Number(child.childcareHoursPerDay ?? 8) : 0;
    const days = cost ? Number(child.childcareDaysPerWeek ?? 5) : 0;
    const monthlyDays = cost ? Number(child.childcareDaysPerMonth ?? 22) : 0;
    if (cost && (!(hours > 0 && hours <= 24 && days > 0 && days <= 7)
      || !Number.isInteger(monthlyDays) || monthlyDays < 1 || monthlyDays > 31)) {
      throw new Error(`Enter a valid care schedule for child ${index + 1}.`);
    }
    person.pre_subsidy_childcare_expenses = { [year]: cost };
    person.childcare_hours_per_day = { [year]: hours };
    person.childcare_days_per_week = { [year]: days };
    person.childcare_attending_days_per_month = { [year]: monthlyDays };
    person.is_enrolled_in_head_start = { [year]: Boolean(child.isHeadStartEnrolled) };
    for (const field of config?.providers || []) {
      if (!enabled || !cost) continue;
      const value = child.childcareProviders?.[field.variable];
      if (!field.options.some(option => option.value === value)) {
        throw new Error(`Choose a provider type for child ${index + 1}.`);
      }
      const target = field.entity === "spm_unit" ? spm : person;
      target[field.variable] = { [year]: value };
    }
  });
  if (!enabled) {
    // A funded place is distinct from eligibility. State take-up flags differ;
    // is_enrolled_in_ccdf instead selects initial/continuing eligibility.
    for (const stateConfig of Object.values(metadata.states)) {
      spm[stateConfig.program] = { [year]: 0 };
    }
  }
  return situation;
}
