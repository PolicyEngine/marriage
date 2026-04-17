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
};

export const PROGRAM_DESCRIPTIONS = {
  // Summary (category labels from computeTableData)
  "Net income":
    "Total income after taxes, credits, and benefits. Does not include the value of healthcare coverage.",
  "Net income (incl. healthcare)":
    "Total income after taxes, credits, and benefits, including the value of healthcare coverage.",
  Earnings:
    "Employment income. Does not change with marital status.",
  "Healthcare benefits":
    "Cash equivalent value of healthcare coverage (Medicaid, CHIP, ACA premium subsidies). Not included in net income.",
  Benefits:
    "Government assistance programs like SNAP, TANF, and Head Start. Eligibility often depends on combined household income.",
  "Refundable tax credits":
    "Tax credits that can result in a payment even if you owe no tax. Includes EITC and CTC.",
  "Taxes before refundable credits":
    "Federal and state income tax, payroll taxes, and other taxes before any refundable credits are applied.",
  // US benefits (keys match formatProgramName output)
  SNAP: "Supplemental Nutrition Assistance Program. Benefits are based on household size and income; marriage combines both incomes.",
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
    "Cash equivalent value of Medicaid health coverage. Eligibility thresholds depend on household income; marriage can change eligibility.",
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

function buildRows(categories, marriedValues, separateValues, headValues, spouseValues, filterZeros, symbol) {
  const rows = [];
  for (let i = 0; i < categories.length; i++) {
    const m = marriedValues[i];
    const s = separateValues[i];
    if (filterZeros && m === 0 && s === 0) continue;
    const delta = m - s;
    const deltaPct = s !== 0 ? delta / s : 0;
    rows.push({
      program: categories[i],
      headSingle: headValues ? formatCurrency(headValues[i], false, symbol) : null,
      spouseSingle: spouseValues ? formatCurrency(spouseValues[i], false, symbol) : null,
      notMarried: formatCurrency(s, false, symbol),
      married: formatCurrency(m, false, symbol),
      delta: formatCurrency(delta, true, symbol),
      deltaPct: formatPercent(deltaPct, true),
      rawDelta: delta,
    });
  }
  return rows;
}

// Round each term before summing so displayed "Not Married" = displayed head + displayed spouse
const rsum = (a, b) => Math.round(a) + Math.round(b);

function buildBreakdownRows(marriedDict, headDict, spouseDict, alwaysShowKeys, symbol) {
  const alwaysShow = new Set((alwaysShowKeys || []).map(formatProgramName));
  const allKeys = [
    ...new Set([
      ...Object.keys(marriedDict),
      ...Object.keys(headDict),
      ...Object.keys(spouseDict),
    ]),
  ];
  const categories = [];
  const marriedValues = [];
  const separateValues = [];
  const headValues = [];
  const spouseValues = [];

  for (const key of allKeys) {
    const mVal = marriedDict[key] || 0;
    const hVal = headDict[key] || 0;
    const sVal = spouseDict[key] || 0;
    const name = formatProgramName(key);
    if (mVal === 0 && hVal === 0 && sVal === 0 && !alwaysShow.has(name)) continue;
    categories.push(name);
    marriedValues.push(mVal);
    separateValues.push(rsum(hVal, sVal));
    headValues.push(hVal);
    spouseValues.push(sVal);
  }

  return buildRows(categories, marriedValues, separateValues, headValues, spouseValues, false, symbol);
}

function sumDict(dict) {
  return Object.values(dict || {}).reduce((a, b) => a + b, 0);
}

function prependTotalRow(rows, label, aggM, aggH, aggS, symbol, { invertDelta = false } = {}) {
  const totalSep = rsum(aggH, aggS);
  const totalDelta = aggM - totalSep;
  rows.unshift({
    program: label,
    headSingle: formatCurrency(aggH, false, symbol),
    spouseSingle: formatCurrency(aggS, false, symbol),
    notMarried: formatCurrency(totalSep, false, symbol),
    married: formatCurrency(aggM, false, symbol),
    delta: formatCurrency(totalDelta, true, symbol),
    deltaPct: formatPercent(totalSep !== 0 ? totalDelta / totalSep : 0, true),
    rawDelta: invertDelta ? -totalDelta : totalDelta,
    isTotal: true,
  });
}

function addOtherRow(rows, label, aggMarried, aggHead, aggSpouse, trackedMarried, trackedHead, trackedSpouse, symbol) {
  const otherM = aggMarried - trackedMarried;
  const otherH = aggHead - trackedHead;
  const otherS = aggSpouse - trackedSpouse;
  const otherTotal = rsum(otherH, otherS);
  if (Math.abs(otherM) < 1 && Math.abs(otherTotal) < 1) return;
  const delta = otherM - otherTotal;
  rows.push({
    program: label,
    headSingle: formatCurrency(otherH, false, symbol),
    spouseSingle: formatCurrency(otherS, false, symbol),
    notMarried: formatCurrency(otherTotal, false, symbol),
    married: formatCurrency(otherM, false, symbol),
    delta: formatCurrency(delta, false, symbol),
    deltaPct: formatPercent(otherTotal !== 0 ? delta / otherTotal : 0),
    rawDelta: delta,
  });
}

export function computeTableData(results, tab, { showHealth = false, currencySymbol = "$" } = {}) {
  const { married, headSingle, spouseSingle } = results;
  const sym = currencySymbol;

  if (tab === "summary") {
    const netKey = showHealth ? "householdNetIncomeWithHealth" : "householdNetIncome";
    const netLabel = "Net income";

    const earnings = (r) =>
      r.aggregates[netKey] - r.aggregates.householdBenefits
      - r.aggregates.householdRefundableCredits + r.aggregates.householdTaxBeforeCredits
      - (showHealth ? r.aggregates.healthcareBenefitValue : 0);

    const categories = [
      netLabel,
      "Earnings",
      ...(showHealth ? ["Healthcare benefits"] : []),
      "Benefits", "Refundable tax credits", "Taxes before refundable credits",
    ];

    const mVals = [
      married.aggregates[netKey],
      earnings(married),
      ...(showHealth ? [married.aggregates.healthcareBenefitValue] : []),
      married.aggregates.householdBenefits,
      married.aggregates.householdRefundableCredits,
      married.aggregates.householdTaxBeforeCredits,
    ];
    const sVals = [
      rsum(headSingle.aggregates[netKey], spouseSingle.aggregates[netKey]),
      rsum(earnings(headSingle), earnings(spouseSingle)),
      ...(showHealth ? [rsum(headSingle.aggregates.healthcareBenefitValue, spouseSingle.aggregates.healthcareBenefitValue)] : []),
      rsum(headSingle.aggregates.householdBenefits, spouseSingle.aggregates.householdBenefits),
      rsum(headSingle.aggregates.householdRefundableCredits, spouseSingle.aggregates.householdRefundableCredits),
      rsum(headSingle.aggregates.householdTaxBeforeCredits, spouseSingle.aggregates.householdTaxBeforeCredits),
    ];
    const hVals = [
      headSingle.aggregates[netKey],
      earnings(headSingle),
      ...(showHealth ? [headSingle.aggregates.healthcareBenefitValue] : []),
      headSingle.aggregates.householdBenefits,
      headSingle.aggregates.householdRefundableCredits,
      headSingle.aggregates.householdTaxBeforeCredits,
    ];
    const spVals = [
      spouseSingle.aggregates[netKey],
      earnings(spouseSingle),
      ...(showHealth ? [spouseSingle.aggregates.healthcareBenefitValue] : []),
      spouseSingle.aggregates.householdBenefits,
      spouseSingle.aggregates.householdRefundableCredits,
      spouseSingle.aggregates.householdTaxBeforeCredits,
    ];

    const rows = buildRows(categories, mVals, sVals, hVals, spVals, false, sym);
    if (rows.length > 0) rows[0].isTotal = true;
    const taxRow = rows.find((r) => r.program === "Taxes before refundable credits");
    if (taxRow) taxRow.rawDelta = -taxRow.rawDelta;
    // Filter out zero rows for categories that don't apply (e.g. UK has no credits)
    return rows.filter((r) => r.isTotal || r.program === "Earnings" || r.rawDelta !== 0 ||
      parseFloat(r.married.replace(/[^0-9.-]/g, "")) !== 0 ||
      parseFloat(r.notMarried.replace(/[^0-9.-]/g, "")) !== 0);
  }

  if (tab === "benefits") {
    const mergedM = { ...married.benefits, ...married.health };
    const mergedH = { ...headSingle.benefits, ...headSingle.health };
    const mergedS = { ...spouseSingle.benefits, ...spouseSingle.health };
    const rows = buildBreakdownRows(mergedM, mergedH, mergedS, null, sym);
    const aggM = married.aggregates.householdBenefits + married.aggregates.healthcareBenefitValue;
    const aggH = headSingle.aggregates.householdBenefits + headSingle.aggregates.healthcareBenefitValue;
    const aggS = spouseSingle.aggregates.householdBenefits + spouseSingle.aggregates.healthcareBenefitValue;
    addOtherRow(rows, "Other Benefits",
      aggM, aggH, aggS,
      sumDict(mergedM), sumDict(mergedH), sumDict(mergedS), sym,
    );
    prependTotalRow(rows, "Total benefits", aggM, aggH, aggS, sym);
    return rows;
  }

  if (tab === "credits") {
    // Merge federal credits with per-state credit breakdowns (strip the aggregate key)
    const strip = (d) => {
      const o = { ...d };
      delete o.state_refundable_credits;
      return o;
    };
    const mergedM = { ...married.credits, ...strip(married.stateCredits || {}) };
    const mergedH = { ...headSingle.credits, ...strip(headSingle.stateCredits || {}) };
    const mergedS = { ...spouseSingle.credits, ...strip(spouseSingle.stateCredits || {}) };
    const totalAgg = (r) => r.aggregates.householdRefundableCredits;
    const rows = buildBreakdownRows(mergedM, mergedH, mergedS, null, sym);
    addOtherRow(rows, "Other Credits",
      totalAgg(married),
      totalAgg(headSingle),
      totalAgg(spouseSingle),
      sumDict(mergedM),
      sumDict(mergedH),
      sumDict(mergedS), sym,
    );
    prependTotalRow(rows, "Total credits", totalAgg(married), totalAgg(headSingle), totalAgg(spouseSingle), sym);
    return rows;
  }

  if (tab === "taxes") {
    const alwaysShow = ["income_tax_before_refundable_credits", "household_state_tax_before_refundable_credits"];
    const rows = buildBreakdownRows(
      married.taxes,
      headSingle.taxes,
      spouseSingle.taxes,
      alwaysShow, sym,
    );
    addOtherRow(rows, "Other Taxes",
      married.aggregates.householdTaxBeforeCredits,
      headSingle.aggregates.householdTaxBeforeCredits,
      spouseSingle.aggregates.householdTaxBeforeCredits,
      sumDict(married.taxes),
      sumDict(headSingle.taxes),
      sumDict(spouseSingle.taxes), sym,
    );
    prependTotalRow(rows, "Total taxes",
      married.aggregates.householdTaxBeforeCredits,
      headSingle.aggregates.householdTaxBeforeCredits,
      spouseSingle.aggregates.householdTaxBeforeCredits,
      sym, { invertDelta: true },
    );
    for (const row of rows) {
      if (!row.isTotal) row.rawDelta = -row.rawDelta;
    }
    return rows;
  }

  return [];
}
