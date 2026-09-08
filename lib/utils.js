export function formatCurrency(value, showPlus = false, symbol = "$") {
  const rounded = Math.round(value);
  const formatted = Math.abs(rounded).toLocaleString();
  if (rounded < 0) return `-${symbol}${formatted}`;
  if (showPlus && rounded > 0) return `+${symbol}${formatted}`;
  return `${symbol}${formatted}`;
}

export function formatPercent(value, showPlus = false) {
  const pct = (value * 100).toFixed(1) + "%";
  if (value < 0) return pct;
  if (showPlus && value > 0) return "+" + pct;
  return pct;
}

const ACRONYMS = {
  eitc: "EITC",
  snap: "SNAP",
  tanf: "TANF",
  wic: "WIC",
  ssi: "SSI",
  chip: "CHIP",
  ctc: "CTC",
  cdcc: "CDCC",
  ptc: "PTC",
  aca: "ACA",
  per_capita_chip: "CHIP",
  spm: "SPM",
  pip: "PIP",
  dla: "DLA",
  jsa: "JSA",
  esa: "ESA",
  child_care_subsidies: "Childcare assistance (CCDF)",
  head_start: "Head Start (service value)",
  early_head_start: "Early Head Start (service value)",
};

export const PROGRAM_DESCRIPTIONS = {
  // Summary (category labels from computeTableData)
  "Household financial resources":
    "Resources after taxes and modeled expenses, including benefits such as SNAP. Healthcare and early education service values are shown separately.",
  "Market income":
    "Income before taxes and benefits, including employment income and any other modeled market income.",
  "Healthcare costs":
    "Modeled household healthcare expenses deducted from financial resources. The value of healthcare benefits is shown separately.",
  "Healthcare service value":
    "Estimated value of healthcare benefits, including Medicaid, CHIP and ACA premium subsidies. Shown separately from household financial resources.",
  "Early education service value":
    "Estimated Head Start and Early Head Start service values, based on spending per enrollee and eligible participation.",
  "Combined resources":
    "Household financial resources plus estimated healthcare and early education service values.",
  "Net income":
    "Total income after taxes, credits, and benefits. Does not include the value of healthcare coverage.",
  "Net income (incl. healthcare)":
    "Total income after taxes, credits, and benefits, including the value of healthcare coverage.",
  Earnings:
    "Employment income. Does not change with marital status.",
  "Housing costs":
    "Rent paid. Net income is shown after housing costs, because two separate households each pay rent while a couple pays once.",
  "Childcare costs": "Annual paid-care charges, including required family contributions. Deducted once from net income; childcare assistance is included in benefits.",
  "Childcare assistance (CCDF)": "Reduction in family childcare spending under the funded-slot assumption. Included once in benefits. Full state payments to providers are shown separately; waiting lists and local funding availability are not modeled.",
  "Head Start (service value)": "Estimated service value based on state spending per enrollee, assuming eligible participation. This is not a cash payment or a guaranteed place.",
  "Early Head Start (service value)": "Estimated infant and toddler service value based on state spending per enrollee, assuming eligible participation. This is not a cash payment or a guaranteed place.",
  "Healthcare benefits":
    "Estimated value of healthcare benefits, including Medicaid, CHIP and ACA premium subsidies. Shown separately from household financial resources.",
  Benefits:
    "Government assistance such as SNAP, TANF and childcare assistance. Healthcare and early education service values are shown separately.",
  "Refundable tax credits":
    "Tax credits that can result in a payment even if you owe no tax. Includes EITC and CTC.",
  "Taxes before refundable credits":
    "Federal and state income tax, payroll taxes, and other taxes before any refundable credits are applied.",
  // US benefits (keys match formatProgramName output)
  SNAP: "Supplemental Nutrition Assistance Program. Benefits depend on the SNAP household's size and income. This calculator assumes cohabiting partners buy and prepare food together, so both incomes already count before marriage.",
  TANF: "Temporary Assistance for Needy Families. Cash assistance with income limits that change when households merge.",
  WIC: "Special Supplemental Nutrition Program for Women, Infants, and Children. Eligibility based on household income.",
  SSI: "Supplemental Security Income. Married couples receive less than two individuals would separately.",
  "Social security":
    "Social Security benefits including retirement, disability, and survivors benefits.",
  "Head start":
    "Federal preschool program for children ages 3\u20135 from low-income families.",
  "Early head start":
    "Federal program for infants and toddlers (0\u20133) from low-income families. Includes childcare and development services.",
  "Free school meals":
    "National School Lunch Program free meals. Eligibility based on household income relative to the poverty line.",
  "Reduced price school meals":
    "National School Lunch Program reduced-price meals. Based on household income between 130%\u2013185% of poverty.",
  "SPM unit broadband subsidy":
    "Broadband internet subsidy for low-income households.",
  "Unemployment compensation":
    "Unemployment insurance benefits for workers who have lost their jobs.",
  "SPM unit capped housing subsidy":
    "Housing subsidies including Section 8 vouchers and public housing assistance.",
  "High efficiency electric home rebate":
    "Rebate for purchasing high-efficiency electric home appliances under the Inflation Reduction Act.",
  "Residential efficiency electrification rebate":
    "Rebate for home energy efficiency improvements and electrification under the Inflation Reduction Act.",
  "Basic income":
    "Universal or targeted basic income programs.",
  "Household state benefits":
    "State-specific benefit programs (e.g., CalWORKs, state supplements).",
  "Commodity supplemental food program":
    "USDA program providing food packages to low-income elderly individuals.",
  "Other benefits":
    "Additional government benefits not individually listed, as computed by PolicyEngine.",
  // Healthcare
  "Medicaid cost":
    "Estimated value of Medicaid health coverage. Eligibility thresholds depend on household income; marriage can change eligibility.",
  CHIP:
    "Children's Health Insurance Program. Provides health coverage for children in families with incomes too high for Medicaid.",
  "ACA PTC":
    "ACA marketplace premium tax credit. Subsidizes health insurance based on household income relative to the poverty line.",
  "Co omnisalud":
    "Colorado OmniSalud program providing health coverage regardless of immigration status.",
  "Or healthier oregon cost":
    "Oregon Healthier Oregon program extending health coverage to additional residents.",
  "Other healthcare":
    "Additional healthcare benefits not individually listed, as computed by PolicyEngine.",
  // US credits
  EITC: "Earned Income Tax Credit. Phase-out thresholds are higher for married filers, but combined income can still reduce the credit.",
  "Refundable CTC":
    "Refundable portion of the Child Tax Credit. Income phase-outs differ by filing status; marriage can push income above thresholds.",
  "Refundable american opportunity credit":
    "Refundable portion of the American Opportunity education tax credit.",
  "Recovery rebate credit":
    "Economic stimulus payment delivered as a refundable tax credit.",
  "Refundable payroll tax credit":
    "Refundable credit offsetting payroll taxes for eligible workers.",
  "Other credits":
    "Additional refundable tax credits not individually listed, as computed by PolicyEngine.",
  // US taxes
  "Employee payroll tax":
    "Employee-side Social Security (6.2%) and Medicare (1.45%) taxes. The additional Medicare tax threshold changes with marriage.",
  "Self employment tax":
    "Social Security and Medicare taxes on self-employment income. Calculated per person, unaffected by marriage.",
  "Income tax before refundable credits":
    "Federal income tax calculated on combined income. Tax brackets for married filers are not exactly double single brackets.",
  "Flat tax":
    "Flat tax on income, if applicable.",
  "Household state tax before refundable credits":
    "Total state income tax before applying state refundable credits.",
  // US state credits
  "State EITC":
    "State-level Earned Income Tax Credit. Many states offer their own EITC as a percentage of the federal credit.",
  "State CTC":
    "State-level Child Tax Credit. Some states provide additional child tax credits beyond the federal CTC.",
  "State CDCC":
    "State-level Child and Dependent Care Credit. State version of the federal dependent care credit.",
  "State refundable credits":
    "Total state refundable tax credits. Includes state EITC, CTC, and other refundable credits.",
  "State income tax before refundable credits":
    "State income tax liability before applying state refundable credits.",
  "Other taxes":
    "Additional taxes not individually listed, as computed by PolicyEngine.",
  // UK benefits
  "Universal credit":
    "Means-tested benefit combining support for living costs, housing, children, and disability. Income-tested on the benefit unit.",
  "Child benefit":
    "Per-child payment. Reduced via the High Income Child Benefit Charge if either partner earns above the threshold.",
  "Housing benefit":
    "Legacy benefit helping with rent costs, being replaced by Universal Credit.",
  "Pension credit":
    "Top-up for pensioners with low income. Married couples are assessed jointly.",
  "Working tax credit":
    "Legacy in-work benefit. Married couples are assessed jointly.",
  "Child tax credit":
    "Legacy per-child benefit. Assessed on joint household income for couples.",
  "Income support":
    "Legacy benefit for those not required to seek work. Means-tested on the benefit unit.",
  "JSA income":
    "Income-based Jobseeker's Allowance. Means-tested on the benefit unit.",
  "ESA income":
    "Income-related Employment and Support Allowance. Means-tested on the benefit unit.",
  "State pension":
    "Contributory pension based on National Insurance record. Not means-tested.",
  "Carers allowance":
    "Payment for people who care for someone with substantial caring needs.",
  PIP:
    "Disability benefit based on care/mobility needs, not means-tested.",
  DLA:
    "Legacy disability benefit being replaced by PIP.",
  "Attendance allowance":
    "Disability benefit for those over State Pension age.",
  "Maternity allowance":
    "Payment for pregnant women who don't qualify for Statutory Maternity Pay.",
  "Winter fuel allowance":
    "Annual payment to help with heating costs for older people.",
  // UK taxes
  "Income tax":
    "Tax on income above the personal allowance. Marriage Allowance lets one partner transfer part of their allowance.",
  "National insurance":
    "Contributions on earnings above the primary threshold. Calculated per person.",
  "Council tax":
    "Local property-based tax set by the local authority. Assessed per dwelling.",
};

export function formatProgramName(name) {
  if (ACRONYMS[name]) return ACRONYMS[name];
  const words = name
    .split(/[_ ]+/)
    .map((word, i) => ACRONYMS[word] || (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word));
  return words.join(" ");
}

// A shared household has one result. Separate households retain each adult's
// result, which can also be shown individually in the table.
function unmarriedScenarios(results) {
  return results.unmarried ? [results.unmarried] : [results.headSingle, results.spouseSingle];
}

export function unmarriedTotal(results, category, key) {
  return unmarriedScenarios(results).reduce((sum, r) => sum + (r[category]?.[key] || 0), 0);
}

function sumDict(dict) {
  return Object.values(dict || {}).reduce((a, b) => a + b, 0);
}

export function resourceValues(result) {
  const a = result.aggregates;
  const financialResources = a.financialResources ?? a.householdNetIncome ?? 0;
  const healthcareBenefitValue = a.healthcareBenefitValue ?? 0;
  const earlyEducationServiceValue = a.earlyEducationServiceValue
    ?? ((result.childcare?.headStartValue || 0) + (result.childcare?.earlyHeadStartValue || 0));
  return {
    financialResources,
    healthcareBenefitValue,
    earlyEducationServiceValue,
    combinedResources: a.combinedResources ?? (financialResources + healthcareBenefitValue + earlyEducationServiceValue),
  };
}

export function computeTableData(results, tab, { showHealth = false, currencySymbol = "$", countryId } = {}) {
  const { married } = results;
  const singles = unmarriedScenarios(results);
  const scenarios = [married, ...singles];
  const sym = currencySymbol;
  const separateServices = countryId === "us";

  function makeRow(program, values, { isTotal = false, invertDelta = false } = {}) {
    const [m, ...unmarried] = values;
    // Round per household so the displayed total matches the displayed parts.
    const s = results.unmarried ? unmarried[0]
      : unmarried.reduce((sum, value) => sum + Math.round(value), 0);
    const delta = m - s;
    return {
      program,
      headSingle: results.unmarried ? null : formatCurrency(unmarried[0], false, sym),
      spouseSingle: results.unmarried ? null : formatCurrency(unmarried[1], false, sym),
      notMarried: formatCurrency(s, false, sym),
      married: formatCurrency(m, false, sym),
      delta: formatCurrency(delta, true, sym),
      deltaPct: formatPercent(s !== 0 ? delta / s : 0, true),
      rawDelta: invertDelta ? -delta : delta,
      ...(isTotal ? { isTotal: true } : {}),
    };
  }

  if (tab === "summary") {
    if (separateServices) {
      const agg = key => r => r.aggregates[key] || 0;
      const financial = r => resourceValues(r).financialResources;
      const marketIncome = r => r.aggregates.marketIncome ?? (
        financial(r) - (r.aggregates.householdBenefits || 0)
        - (r.aggregates.householdRefundableCredits || 0) + (r.aggregates.householdTaxBeforeCredits || 0)
        + (r.aggregates.healthCosts || 0) + (r.aggregates.childcareCostDeducted || 0)
      );
      const definitions = [
        ["Household financial resources", financial, { isTotal: true }],
        ["Market income", marketIncome],
        ["Benefits", agg("householdBenefits")],
        ["Refundable tax credits", agg("householdRefundableCredits")],
        ["Taxes before refundable credits", agg("householdTaxBeforeCredits"), { invertDelta: true }],
        ["Healthcare costs", agg("healthCosts"), { invertDelta: true }],
        ["Childcare costs", agg("childcareCostDeducted"), { invertDelta: true }],
      ];
      return definitions.flatMap(([label, value, options]) => {
        const values = scenarios.map(value);
        return label === "Household financial resources" || label === "Market income" || values.some(v => v !== 0)
          ? [makeRow(label, values, options)] : [];
      });
    }
    const netKey = showHealth ? "householdNetIncomeWithHealth" : "householdNetIncome";
    const agg = key => r => r.aggregates[key] || 0;
    // Restore costs already deducted from net income to recover earnings.
    const earnings = r => r.aggregates[netKey] - r.aggregates.householdBenefits
      - r.aggregates.householdRefundableCredits + r.aggregates.householdTaxBeforeCredits
      - (showHealth ? r.aggregates.healthcareBenefitValue : 0)
      + (r.aggregates.rentDeducted || 0) + (r.aggregates.childcareCostDeducted || 0);
    const definitions = [
      ["Net income", agg(netKey), { isTotal: true }],
      ["Earnings", earnings],
      ...(showHealth ? [["Healthcare benefits", agg("healthcareBenefitValue")]] : []),
      ["Benefits", agg("householdBenefits")],
      ["Refundable tax credits", agg("householdRefundableCredits")],
      ["Taxes before refundable credits", agg("householdTaxBeforeCredits"), { invertDelta: true }],
      ...(scenarios.some(r => r.aggregates.rentDeducted > 0)
        ? [["Housing costs", agg("rentDeducted"), { invertDelta: true }]] : []),
      ...(scenarios.some(r => r.aggregates.childcareCostDeducted > 0)
        ? [["Childcare costs", agg("childcareCostDeducted"), { invertDelta: true }]] : []),
    ];
    return definitions.flatMap(([label, value, options]) => {
      const values = scenarios.map(value);
      return label === "Net income" || label === "Earnings" || values.some(v => v !== 0)
        ? [makeRow(label, values, options)] : [];
    });
  }

  const stripStateAggregate = d => Object.fromEntries(
    Object.entries(d || {}).filter(([key]) => key !== "state_refundable_credits"),
  );
  const config = {
    benefits: {
      dict: r => separateServices
        ? Object.fromEntries(Object.entries(r.benefits || {}).filter(([key]) => !["head_start", "early_head_start"].includes(key)))
        : ({ ...r.benefits, ...r.health }),
      total: r => (r.aggregates.householdBenefits || 0) + (separateServices ? 0 : (r.aggregates.healthcareBenefitValue || 0)),
      totalLabel: "Total benefits", otherLabel: "Other Benefits",
    },
    healthcare: {
      dict: r => r.health || {},
      total: r => r.aggregates.healthcareBenefitValue || 0,
      totalLabel: "Healthcare service value", otherLabel: "Other healthcare",
    },
    credits: {
      dict: r => ({ ...r.credits, ...stripStateAggregate(r.stateCredits) }),
      total: r => r.aggregates.householdRefundableCredits,
      totalLabel: "Total credits", otherLabel: "Other Credits",
    },
    taxes: {
      dict: r => r.taxes,
      total: r => r.aggregates.householdTaxBeforeCredits,
      totalLabel: "Total taxes", otherLabel: "Other Taxes", invertDelta: true,
      alwaysShow: ["income_tax_before_refundable_credits", "household_state_tax_before_refundable_credits"],
    },
  }[tab];
  if (!config) return [];

  const dicts = scenarios.map(config.dict);
  const totals = scenarios.map(config.total);
  const rows = [makeRow(config.totalLabel, totals, { isTotal: true, invertDelta: config.invertDelta })];
  const keys = [...new Set(dicts.flatMap(d => Object.keys(d || {})))];
  for (const key of keys) {
    const values = dicts.map(d => d?.[key] || 0);
    if (values.every(v => v === 0) && !config.alwaysShow?.includes(key)) continue;
    rows.push(makeRow(formatProgramName(key), values, config));
  }
  const other = totals.map((total, i) => total - sumDict(dicts[i]));
  const unmarriedOther = other.slice(1).reduce((sum, value) => sum + Math.round(value), 0);
  if (Math.abs(other[0]) >= 1 || Math.abs(unmarriedOther) >= 1) {
    rows.push(makeRow(config.otherLabel, other, config));
  }
  return rows;
}


// US calculations use calendar years; UK tax years span April to April.
export function formatYearLabel(year, countryId = "us") {
  if (countryId !== "uk") return String(year);
  // Number("") is 0, so test the shape of the string rather than the number.
  if (!/^\d{4}$/.test(String(year).trim())) return String(year);
  const start = Number(year);
  const end = (start + 1) % 100;
  return `${start}-${String(end).padStart(2, "0")}`;
}
