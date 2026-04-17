import usMetadata from "./metadata.json";
import ukMetadata from "./metadata-uk.json";

export const US_REGIONS = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NYC", name: "New York City" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];

export const UK_REGIONS = [
  { code: "ENGLAND", name: "England" },
  { code: "SCOTLAND", name: "Scotland" },
  { code: "WALES", name: "Wales" },
  { code: "NORTHERN_IRELAND", name: "Northern Ireland" },
];

export const COUNTRIES = {
  us: {
    id: "us",
    name: "United States",
    currencySymbol: "$",
    apiPath: "/us/calculate",
    defaultYear: "2026",
    availableYears: ["2024", "2025", "2026", "2027", "2028"],
    defaultAge: 40,
    defaultRegion: "CA",
    regions: US_REGIONS,
    regionLabel: "State",
    regionVariable: "state_name",
    metadata: usMetadata,
    entityContainers: {
      household: { key: "households", name: "your household" },
      tax_unit: { key: "tax_units", name: "your tax unit" },
      spm_unit: { key: "spm_units", name: "your spm_unit" },
    },
    tabs: ["summary", "taxes", "benefits", "credits"],
    hasCredits: true,
    hasStateCredits: true,
    hasDisability: true,
    hasPregnancy: true,
    hasESI: true,
    hasNYC: true,
    // Maps standard aggregate keys to variable names in the API response
    aggregateMap: {
      householdNetIncome: "household_net_income",
      householdNetIncomeWithHealth: "household_net_income_including_health_benefits",
      householdBenefits: "household_benefits",
      householdRefundableCredits: "household_refundable_tax_credits",
      householdTaxBeforeCredits: "household_tax_before_refundable_credits",
      healthcareBenefitValue: "healthcare_benefit_value",
      householdRefundableStateCredits: "household_refundable_state_tax_credits",
    },
    // Grid variables for heatmap, in order
    gridConfig: [
      { variable: "household_net_income", tab: "net income" },
      { variable: "household_net_income_including_health_benefits", tab: "net income (with healthcare)" },
      { variable: "household_benefits", tab: "benefits" },
      { variable: "household_refundable_tax_credits", tab: "refundable tax credits" },
      { variable: "household_tax_before_refundable_credits", tab: "tax before refundable credits", invertDelta: true },
      { variable: "healthcare_benefit_value", tab: "healthcare benefits" },
      { variable: "household_refundable_state_tax_credits", tab: "state credits" },
    ],
  },
  uk: {
    id: "uk",
    name: "United Kingdom",
    currencySymbol: "\u00A3",
    apiPath: "/uk/calculate",
    defaultYear: "2025",
    availableYears: ["2024", "2025", "2026", "2027", "2028"],
    defaultAge: 35,
    defaultRegion: "ENGLAND",
    regions: UK_REGIONS,
    regionLabel: "Country",
    regionVariable: "country",
    metadata: ukMetadata,
    entityContainers: {
      household: { key: "households", name: "your household" },
      benunit: { key: "benunits", name: "your benefit unit" },
    },
    tabs: ["summary", "taxes", "benefits"],
    hasCredits: false,
    hasStateCredits: false,
    hasDisability: false,
    hasPregnancy: false,
    hasESI: false,
    hasNYC: false,
    aggregateMap: {
      householdNetIncome: "household_net_income",
      householdNetIncomeWithHealth: "household_net_income", // No separate health metric in UK
      householdBenefits: "household_benefits",
      householdRefundableCredits: null,
      householdTaxBeforeCredits: "household_tax",
      healthcareBenefitValue: null,
      householdRefundableStateCredits: null,
    },
    gridConfig: [
      { variable: "household_net_income", tab: "net income" },
      { variable: "household_benefits", tab: "benefits" },
      { variable: "household_tax", tab: "tax", invertDelta: true },
    ],
  },
};

export function getCountry(id) {
  return COUNTRIES[id] || COUNTRIES.us;
}
