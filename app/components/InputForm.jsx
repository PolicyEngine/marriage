import React, { useState, useEffect, useRef } from "react";

import { isRentedTenure } from "@/lib/api";
import { formatYearLabel } from "@/lib/utils";
import { UK_BRMAS, DEFAULT_BRMA } from "@/lib/countries";
import FormSelect from "./FormSelect";

function formatIncome(value) {
  const num = typeof value === "number" ? value : parseNumber(value);
  if (num === 0 && value === "") return "";
  return num.toLocaleString("en-US");
}

function parseNumber(str) {
  const cleaned = String(str).replace(/[$,\u00A3]/g, "");
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function capitaliseFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function joinWithAnd(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const DEFAULT_INCOME = 45000;

export default function InputForm({ country, countries, countryId, onCountryChange, onCalculate, onInputChange, loading, initialValues, externalIncomes }) {
  const iv = initialValues || {};
  const [regionCode, setRegionCode] = useState(iv.regionCode || iv.stateCode || country.defaultRegion);
  const [headIncome, setHeadIncome] = useState(
    formatIncome(iv.headIncome != null ? iv.headIncome : DEFAULT_INCOME),
  );
  const [spouseIncome, setSpouseIncome] = useState(
    formatIncome(iv.spouseIncome != null ? iv.spouseIncome : DEFAULT_INCOME),
  );
  const [headDisabled, setHeadDisabled] = useState(iv.disabilityStatus?.head || false);
  const [spouseDisabled, setSpouseDisabled] = useState(iv.disabilityStatus?.spouse || false);
  const [headAge, setHeadAge] = useState(iv.headAge ? String(iv.headAge) : String(country.defaultAge));
  const [spouseAge, setSpouseAge] = useState(iv.spouseAge ? String(iv.spouseAge) : String(country.defaultAge));
  const [headPregnant, setHeadPregnant] = useState(iv.pregnancyStatus?.head || false);
  const [spousePregnant, setSpousePregnant] = useState(iv.pregnancyStatus?.spouse || false);
  const [headESI, setHeadESI] = useState(iv.esiStatus?.head || false);
  const [spouseESI, setSpouseESI] = useState(iv.esiStatus?.spouse || false);
  const [children, setChildren] = useState(
    (iv.children || []).map((c) => ({ ...c, age: String(c.age) })),
  );
  const [year, setYear] = useState(iv.year || country.defaultYear);
  const [livingArrangement, setLivingArrangement] = useState(iv.livingArrangement || "cohabiting");
  // UK Universal Credit inputs. Each maps to an element of uc_maximum_amount
  // or a means-test component; see lib/api.js createUKSituation.
  const [rent, setRent] = useState(formatIncome(iv.rent != null ? iv.rent : 0));
  const [tenureType, setTenureType] = useState(iv.tenureType || "OWNED_OUTRIGHT");
  const [brma, setBrma] = useState(iv.brma || DEFAULT_BRMA);
  const [childcareCosts, setChildcareCosts] = useState(
    formatIncome(iv.childcareCosts != null ? iv.childcareCosts : 0),
  );
  const [savings, setSavings] = useState(formatIncome(iv.savings != null ? iv.savings : 0));
  const [headCarer, setHeadCarer] = useState(iv.carerStatus?.head || false);
  const [spouseCarer, setSpouseCarer] = useState(iv.carerStatus?.spouse || false);
  const [headSelfEmp, setHeadSelfEmp] = useState(
    formatIncome(iv.selfEmploymentIncome?.head || 0),
  );
  const [spouseSelfEmp, setSpouseSelfEmp] = useState(
    formatIncome(iv.selfEmploymentIncome?.spouse || 0),
  );
  const [headPension, setHeadPension] = useState(
    formatIncome(iv.pensionIncome?.head || 0),
  );
  const [spousePension, setSpousePension] = useState(
    formatIncome(iv.pensionIncome?.spouse || 0),
  );
  const [errors, setErrors] = useState({});
  const previousInputs = useRef(null);
  const syncedIncomes = useRef(null);
  const childrenKey = children.map((c) => `${c.age}:${c.isDisabled}`).join(",");
  const adultInputs = ["age"];
  if (country.hasDisability) adultInputs.push("disability");
  if (country.hasPregnancy) adultInputs.push("pregnancy");
  if (country.hasESI) adultInputs.push("ESI status");
  // Owners get no Universal Credit housing element, so the rent field does
  // not apply and must not be deducted from net income either.
  const rentsApply = isRentedTenure(tenureType);

  // Everything under "More details" is optional and country-gated. The badge
  // counts how many are actually set, so a collapsed panel never hides an
  // input that is changing the result.
  // The panel always exists: it holds the partner and children as well as the
  // optional Universal Credit inputs.
  const hasExtraInputs = true;
  const extrasInUse = [
    rentsApply && parseNumber(rent) > 0,
    parseNumber(childcareCosts) > 0,
    parseNumber(savings) > 0,
    parseNumber(headSelfEmp) > 0,
    parseNumber(spouseSelfEmp) > 0,
    parseNumber(headPension) > 0,
    parseNumber(spousePension) > 0,
    headCarer,
    spouseCarer,
    headDisabled,
    spouseDisabled,
    children.length > 0,
  ].filter(Boolean).length;

  const householdInputs = [];
  if (country.hasHousing) householdInputs.push("rent and tenure type");
  if (country.hasChildcare) householdInputs.push("childcare costs");
  if (country.hasCapital) householdInputs.push("savings");
  if (country.hasSelfEmployment) adultInputs.push("self-employment income");
  if (country.hasPensionIncome) adultInputs.push("private pension income");
  if (country.hasCarer) adultInputs.push("carer status");

  const omitted = ["deductions"];
  if (!country.hasSelfEmployment) omitted.unshift("self-employment income");
  if (!country.hasHousing) omitted.unshift("rent");
  if (!country.hasChildcare) omitted.unshift("childcare expenses");
  if (!country.hasCapital) omitted.unshift("savings and capital");
  if (!country.hasPensionIncome) omitted.unshift("unearned income");

  const separateLabel = country.id === "uk" ? "living-apart" : "unmarried";
  const assumptions = [
    `The calculator uses only the inputs shown here: ${country.regionLabel.toLowerCase()}, year, each adult's wages, ${joinWithAnd(adultInputs)}${householdInputs.length ? `, the household's ${joinWithAnd(householdInputs)}` : ""}, and each child's ${country.hasDisability && country.id !== "uk" ? "age and disability" : "age"}.`,
    `Earnings mean wages and salaries only. ${capitaliseFirst(joinWithAnd([...omitted, "other omitted inputs"]))} are assumed to be zero.`,
  ];
  if (country.id === "us") {
    assumptions.push("All children are assumed to be both adults' children.");
  }
  if (country.id === "us" && livingArrangement === "cohabiting") {
    assumptions.push(
      "Living together, you share a home, buy and prepare food together, and share resources. SNAP and other modeled household benefits use a shared resource unit in both scenarios.",
      "For unmarried taxes, all children are assigned to you, and your partner files separately. You pay more than half the cost of keeping up the home, allowing head-of-household filing when otherwise eligible.",
    );
  } else {
    assumptions.push(`For the ${separateLabel} comparison, all children are assigned to you and your partner is simulated separately without children.`);
  }
  if (country.id === "us" && livingArrangement === "separate") {
    assumptions.push("This comparison includes the effect of combining households as well as marriage. Housing costs and savings from sharing a home are not modeled.");
  }
  if (country.id === "uk") {
    assumptions.push(
      "The UK assesses couples on whether they live together, not on marriage. This compares a cohabiting couple with two separate households.",
    );
  }
  if (country.hasHousing && rentsApply) {
    assumptions.push(
      "Net income is shown after rent. PolicyEngine counts the housing element as income but does not subtract rent, so living apart would otherwise collect housing support twice and pay no rent.",
    );
    assumptions.push(
      "Living apart, each household pays the rent entered and savings are split evenly.",
    );
  }
  if (country.hasHousing && !rentsApply) {
    assumptions.push(
      "Owners receive no housing element, so rent is not applied. Mortgage costs are not modelled.",
    );
  }
  if (country.hasESI) {
    assumptions.push("If Has ESI is checked, healthcare benefits are excluded from the analysis.");
  }

  // Reset region and defaults when country changes
  const prevCountryId = useRef(country.id);
  useEffect(() => {
    if (prevCountryId.current !== country.id) {
      prevCountryId.current = country.id;
      setRegionCode(country.defaultRegion);
      setYear(country.defaultYear);
      setLivingArrangement("cohabiting");
      setHeadAge(String(country.defaultAge));
      setSpouseAge(String(country.defaultAge));
      if (!country.hasDisability) {
        setHeadDisabled(false);
        setSpouseDisabled(false);
      }
      if (!country.hasPregnancy) {
        setHeadPregnant(false);
        setSpousePregnant(false);
      }
      if (!country.hasHousing) {
        setRent(formatIncome(0));
        setTenureType("OWNED_OUTRIGHT");
        setBrma(DEFAULT_BRMA);
      }
      if (!country.hasChildcare) setChildcareCosts(formatIncome(0));
      if (!country.hasCapital) setSavings(formatIncome(0));
      if (!country.hasCarer) {
        setHeadCarer(false);
        setSpouseCarer(false);
      }
      if (!country.hasSelfEmployment) {
        setHeadSelfEmp(formatIncome(0));
        setSpouseSelfEmp(formatIncome(0));
      }
      if (!country.hasPensionIncome) {
        setHeadPension(formatIncome(0));
        setSpousePension(formatIncome(0));
      }
      if (!country.hasESI) {
        setHeadESI(false);
        setSpouseESI(false);
      }
    }
  }, [country]);

  // Clear stale results when inputs change (but not on initial mount)
  useEffect(() => {
    const inputs = [regionCode, headIncome, spouseIncome, headAge, spouseAge,
      headDisabled, spouseDisabled, headPregnant, spousePregnant, headESI, spouseESI, year, childrenKey, livingArrangement,
      rent, tenureType, brma, childcareCosts, savings,
      headCarer, spouseCarer, headSelfEmp, spouseSelfEmp, headPension, spousePension];
    const previous = previousInputs.current;
    previousInputs.current = inputs;
    // Strict Mode repeats mount effects. Only an actual value change should
    // cancel a pending calculation, including one restored from a shared link.
    if (!previous || inputs.every((value, i) => value === previous[i])) return;
    if (syncedIncomes.current) {
      const synced = syncedIncomes.current;
      syncedIncomes.current = null;
      if (headIncome === synced.headIncome && spouseIncome === synced.spouseIncome) return;
    }
    if (onInputChange) onInputChange();
  }, [regionCode, headIncome, spouseIncome, headAge, spouseAge,
    headDisabled, spouseDisabled, headPregnant, spousePregnant, headESI, spouseESI, year, childrenKey, livingArrangement,
    rent, tenureType, brma, childcareCosts, savings,
    headCarer, spouseCarer, headSelfEmp, spouseSelfEmp,
    headPension, spousePension, onInputChange]);

  function buildFormData() {
    return {
      regionCode,
      stateCode: regionCode, // backward compat
      headIncome: parseNumber(headIncome),
      spouseIncome: parseNumber(spouseIncome),
      headAge: Number(headAge) || country.defaultAge,
      spouseAge: Number(spouseAge) || country.defaultAge,
      children: children.map((c) => ({ ...c, age: Number(c.age) || 0 })),
      disabilityStatus: { head: headDisabled, spouse: spouseDisabled },
      pregnancyStatus: { head: headPregnant, spouse: spousePregnant },
      esiStatus: { head: headESI, spouse: spouseESI },
      year,
      livingArrangement: country.id === "us" ? livingArrangement : "separate",
      rent: rentsApply ? parseNumber(rent) : 0,
      tenureType,
      brma,
      childcareCosts: parseNumber(childcareCosts),
      savings: parseNumber(savings),
      carerStatus: { head: headCarer, spouse: spouseCarer },
      selfEmploymentIncome: {
        head: parseNumber(headSelfEmp),
        spouse: parseNumber(spouseSelfEmp),
      },
      pensionIncome: {
        head: parseNumber(headPension),
        spouse: parseNumber(spousePension),
      },
    };
  }

  // Sync income fields when heatmap cell is clicked
  useEffect(() => {
    if (externalIncomes) {
      const nextHead = formatIncome(externalIncomes.headIncome);
      const nextSpouse = formatIncome(externalIncomes.spouseIncome);
      if (nextHead !== headIncome || nextSpouse !== spouseIncome) {
        syncedIncomes.current = { headIncome: nextHead, spouseIncome: nextSpouse };
        setHeadIncome(nextHead);
        setSpouseIncome(nextSpouse);
      }
    }
    // Only external selections trigger a sync; user edits must remain editable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalIncomes]);

  function setError(field, msg) {
    setErrors((prev) => ({ ...prev, [field]: msg }));
    setTimeout(() => setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; }), 3000);
  }

  function handleIncomeChange(setter, value) {
    const cleaned = value.replace(/[$,\u00A3]/g, "");
    if (cleaned === "" || /^\d*$/.test(cleaned)) setter(value);
  }

  function handleIncomeBlur(setter, value, field) {
    const num = parseNumber(value);
    setter(formatIncome(Math.max(0, num)));
    if (num < 0) setError(field, "Set to 0");
  }

  function handleAgeBlur(setter, value, field) {
    let num = Number(value);
    if (Number.isNaN(num) || value === "") num = country.defaultAge;
    const clamped = clamp(Math.round(num), 18, 100);
    setter(String(clamped));
    if (num < 18 || num > 100) setError(field, "18\u2013100");
  }

  function handleChildAgeBlur(index, value) {
    let num = Number(value);
    if (Number.isNaN(num) || value === "") num = 0;
    const clamped = clamp(Math.round(num), 0, 18);
    const updated = [...children];
    updated[index] = { ...updated[index], age: String(clamped) };
    setChildren(updated);
    if (num < 0 || num > 18) setError(`childAge${index}`, "0\u201318");
  }

  function updateChild(index, field, value) {
    const updated = [...children];
    updated[index] = { ...updated[index], [field]: value };
    setChildren(updated);
  }

  function handleSubmit(e) {
    e.preventDefault();
    onCalculate(buildFormData());
  }

  return (
    <form className="sidebar-form" onSubmit={handleSubmit}>
      {countries && (
        <div className="sf-field">
          <div className="country-toggle">
            {Object.values(countries).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`country-toggle-btn${countryId === c.id ? " active" : ""}`}
                onClick={() => onCountryChange(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sf-row">
        <div className="sf-field sf-grow">
          <label htmlFor="region">{country.regionLabel}</label>
          <FormSelect
            id="region"
            label={country.regionLabel}
            value={regionCode}
            onValueChange={setRegionCode}
            options={country.regions.map((region) => ({ value: region.code, label: region.name }))}
          />
        </div>
        <div className="sf-field sf-year">
          <label htmlFor="year">Year</label>
          <FormSelect
            id="year"
            label="Year"
            value={year}
            onValueChange={setYear}
            options={country.availableYears.map((year) => ({ value: year, label: formatYearLabel(year, country.id) }))}
          />
        </div>
      </div>

      {country.id === "us" && (
        <div className="sf-field">
          <label htmlFor="living-arrangement">Unmarried living arrangement</label>
          <FormSelect
            id="living-arrangement"
            label="Unmarried living arrangement"
            value={livingArrangement}
            onValueChange={setLivingArrangement}
            options={[
              { value: "cohabiting", label: "Living together" },
              { value: "separate", label: "Living separately" },
            ]}
          />
        </div>
      )}

      <PersonSection
        title="You"
        accent="you"
        income={headIncome}
        onIncomeChange={(v) => handleIncomeChange(setHeadIncome, v)}
        onIncomeBlur={() => handleIncomeBlur(setHeadIncome, headIncome, "headIncome")}
        incomeError={errors.headIncome}
        age={headAge}
        onAgeChange={setHeadAge}
        onAgeBlur={() => handleAgeBlur(setHeadAge, headAge, "headAge")}
        ageError={errors.headAge}
        disabled={headDisabled}
        onDisabledChange={setHeadDisabled}
        pregnant={headPregnant}
        onPregnantChange={setHeadPregnant}
        hasESI={headESI}
        onESIChange={setHeadESI}
        showDisability={false}
        showPregnancy={false}
        showESI={false}
        currencySymbol={country.currencySymbol}
      />

      <PersonSection
        title="Your partner"
        accent="partner"
        income={spouseIncome}
        onIncomeChange={(v) => handleIncomeChange(setSpouseIncome, v)}
        onIncomeBlur={() => handleIncomeBlur(setSpouseIncome, spouseIncome, "spouseIncome")}
        incomeError={errors.spouseIncome}
        age={spouseAge}
        onAgeChange={setSpouseAge}
        onAgeBlur={() => handleAgeBlur(setSpouseAge, spouseAge, "spouseAge")}
        ageError={errors.spouseAge}
        showDisability={false}
        showPregnancy={false}
        showESI={false}
        currencySymbol={country.currencySymbol}
      />

      {hasExtraInputs && (
        <details className="sf-more">
          <summary className="sf-more-summary">
            More details
            {extrasInUse > 0 && <span className="sf-more-badge">{extrasInUse}</span>}
          </summary>
          <div className="sf-more-body">
            <ExtraAdultFields
              title="You"
              accent="you"
              currencySymbol={country.currencySymbol}
              selfEmployment={headSelfEmp}
              onSelfEmploymentChange={(v) => handleIncomeChange(setHeadSelfEmp, v)}
              onSelfEmploymentBlur={() => handleIncomeBlur(setHeadSelfEmp, headSelfEmp, "headSelfEmp")}
              pension={headPension}
              onPensionChange={(v) => handleIncomeChange(setHeadPension, v)}
              onPensionBlur={() => handleIncomeBlur(setHeadPension, headPension, "headPension")}
              carer={headCarer}
              onCarerChange={setHeadCarer}
              disabled={headDisabled}
              onDisabledChange={setHeadDisabled}
              pregnant={headPregnant}
              onPregnantChange={setHeadPregnant}
              hasESI={headESI}
              onESIChange={setHeadESI}
              showSelfEmployment={country.hasSelfEmployment}
              showPension={country.hasPensionIncome}
              showCarer={country.hasCarer}
              showDisability={country.hasDisability}
              showPregnancy={country.hasPregnancy}
              showESI={country.hasESI}
            />

            <ExtraAdultFields
              title="Your partner"
              accent="partner"
              currencySymbol={country.currencySymbol}
              selfEmployment={spouseSelfEmp}
              onSelfEmploymentChange={(v) => handleIncomeChange(setSpouseSelfEmp, v)}
              onSelfEmploymentBlur={() => handleIncomeBlur(setSpouseSelfEmp, spouseSelfEmp, "spouseSelfEmp")}
              pension={spousePension}
              onPensionChange={(v) => handleIncomeChange(setSpousePension, v)}
              onPensionBlur={() => handleIncomeBlur(setSpousePension, spousePension, "spousePension")}
              carer={spouseCarer}
              onCarerChange={setSpouseCarer}
              disabled={spouseDisabled}
              onDisabledChange={setSpouseDisabled}
              pregnant={spousePregnant}
              onPregnantChange={setSpousePregnant}
              hasESI={spouseESI}
              onESIChange={setSpouseESI}
              showSelfEmployment={country.hasSelfEmployment}
              showPension={country.hasPensionIncome}
              showCarer={country.hasCarer}
              showDisability={country.hasDisability}
              showPregnancy={country.hasPregnancy}
              showESI={country.hasESI}
            />

            <div className="sf-children">
              <div className="sf-children-header">
                <span className="sf-children-label sf-label-tip">
                  Children
                  <span className="sf-label-tooltip">All dependents are attributed to the head of household when considering unmarried filers.</span>
                </span>
                <button
                  type="button"
                  className="btn-add-child"
                  aria-label="Add child"
                  onClick={() => setChildren([...children, { age: "5", isDisabled: false }])}
                >+</button>
              </div>
              {children.map((child, i) => (
                <div className="sf-child" key={i}>
                  <div className="sf-child-age">
                    <input
                      type="number"
                      min="0"
                      max="18"
                      placeholder="Age"
                      aria-label={`Child ${i + 1} age`}
                      value={child.age}
                      className={errors[`childAge${i}`] ? "input-error" : ""}
                      onChange={(e) => updateChild(i, "age", e.target.value)}
                      onBlur={() => handleChildAgeBlur(i, child.age)}
                    />
                    <span className="sf-child-age-suffix">yr</span>
                  </div>
                  <label className="sf-toggle">
                    <input
                      type="checkbox"
                      checked={child.isDisabled}
                      onChange={(e) => updateChild(i, "isDisabled", e.target.checked)}
                    />
                    <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
                    Disabled
                  </label>
                  <button
                    type="button"
                    className="sf-child-rm"
                    aria-label={`Remove child ${i + 1}`}
                    onClick={() => setChildren(children.filter((_, j) => j !== i))}
                  >&times;</button>
                </div>
              ))}
            </div>


            {country.hasHousing && (
              <div className="sf-group">
                <div className="sf-group-title">Housing</div>
                <div className="sf-row">
                  <div className="sf-field sf-grow">
                    <label htmlFor="tenure" className="sf-label-tip">
                      Tenure
                      <span className="sf-label-tooltip">
                        Private rent is capped at the Local Housing Allowance
                        rate. Social rent is not. Owners get no housing element.
                      </span>
                    </label>
                    <FormSelect
                      id="tenure"
                      label="Tenure"
                      value={tenureType}
                      onValueChange={setTenureType}
                      options={[
                        { value: "OWNED_OUTRIGHT", label: "Owned outright" },
                        { value: "OWNED_WITH_MORTGAGE", label: "Owned with a mortgage" },
                        { value: "RENT_PRIVATELY", label: "Rented privately" },
                        { value: "RENT_FROM_COUNCIL", label: "Rented from council" },
                        { value: "RENT_FROM_HA", label: "Rented from housing association" },
                      ]}
                    />
                  </div>
                  <div className="sf-field sf-money">
                    <label className="sf-label-tip">
                      Rent
                      <span className="sf-label-tooltip">
                        Yearly. Drives the housing element. Net income is shown
                        after rent, and each household pays it when living apart.
                      </span>
                    </label>
                    <div className="sf-input-prefix">
                      <span>{country.currencySymbol}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Annual rent"
                        value={rentsApply ? rent : ""}
                        placeholder={rentsApply ? "" : "n/a"}
                        disabled={!rentsApply}
                        className={errors.rent ? "input-error" : ""}
                        onChange={(e) => handleIncomeChange(setRent, e.target.value)}
                        onBlur={() => handleIncomeBlur(setRent, rent, "rent")}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {country.hasHousing && tenureType === "RENT_PRIVATELY" && (
              <div className="sf-field">
                <label htmlFor="rental-market-area" className="sf-label-tip">
                  Rental market area
                  <span className="sf-label-tooltip">
                    Private rent is capped at the Local Housing Allowance rate
                    for the local Broad Rental Market Area, which varies widely.
                    Social rent is not capped, so this does not apply there.
                  </span>
                </label>
                <FormSelect
                  id="rental-market-area"
                  label="Rental market area"
                  value={brma}
                  onValueChange={setBrma}
                  options={UK_BRMAS.map((area) => ({ value: area.code, label: area.name }))}
                />
              </div>
            )}

            {(country.hasChildcare || country.hasCapital) && (
              <div className="sf-group">
                <div className="sf-group-title">Costs and capital</div>
                <div className="sf-row">
                  {country.hasChildcare && (
                    <div className="sf-field sf-grow">
                      <label className="sf-label-tip">
                        Childcare
                        <span className="sf-label-tooltip">
                          Yearly. Only paid when the work condition is met, and
                          capped per child. Split evenly across the children.
                        </span>
                      </label>
                      <div className="sf-input-prefix">
                        <span>{country.currencySymbol}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label="Annual childcare costs"
                          value={childcareCosts}
                          className={errors.childcareCosts ? "input-error" : ""}
                          onChange={(e) => handleIncomeChange(setChildcareCosts, e.target.value)}
                          onBlur={() => handleIncomeBlur(setChildcareCosts, childcareCosts, "childcareCosts")}
                        />
                      </div>
                    </div>
                  )}
                  {country.hasCapital && (
                    <div className="sf-field sf-grow">
                      <label className="sf-label-tip">
                        Savings
                        <span className="sf-label-tooltip">
                          Entitlement is nil above the upper capital limit.
                          Split evenly between the two adults when living apart.
                        </span>
                      </label>
                      <div className="sf-input-prefix">
                        <span>{country.currencySymbol}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label="Savings"
                          value={savings}
                          className={errors.savings ? "input-error" : ""}
                          onChange={(e) => handleIncomeChange(setSavings, e.target.value)}
                          onBlur={() => handleIncomeBlur(setSavings, savings, "savings")}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      <button type="submit" className="btn-calc" disabled={loading}>
        {loading ? <><span className="spinner" /> Calculating...</> : "Calculate"}
      </button>

      <details className="sf-assumptions">
        <summary className="sf-assumptions-summary">Assumptions</summary>
        <div className="sf-assumptions-body" role="note" aria-label="Model assumptions">
          <ul className="sf-assumptions-list">
            {assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      </details>
    </form>
  );
}

// The optional per-adult inputs, shown inside "More details" so the visible
// form stays down to relationship status, region, year and your own income.
function ExtraAdultFields({
  title, accent, currencySymbol,
  income, onIncomeChange, onIncomeBlur, incomeError, showIncome,
  age, onAgeChange, onAgeBlur, ageError,
  selfEmployment, onSelfEmploymentChange, onSelfEmploymentBlur, showSelfEmployment,
  pension, onPensionChange, onPensionBlur, showPension,
  carer, onCarerChange, showCarer,
  disabled, onDisabledChange, showDisability,
  pregnant, onPregnantChange, showPregnancy,
  hasESI, onESIChange, showESI,
}) {
  const showMoney = showSelfEmployment || showPension;
  const showChecks = showCarer || showDisability || showPregnancy || showESI;
  if (!showIncome && !showMoney && !showChecks) return null;
  return (
    <div className={`sf-extra sf-extra--${accent}`}>
      <div className="sf-extra-title">{title}</div>
      {showIncome && (
        <div className="sf-row">
          <div className="sf-field sf-grow">
            <label className="sf-label-tip">
              Income
              <span className="sf-label-tooltip">Wages and salaries.</span>
            </label>
            <div className="sf-input-prefix">
              <span>{currencySymbol}</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label={`${title} income`}
                value={income}
                className={incomeError ? "input-error" : ""}
                onChange={(e) => onIncomeChange(e.target.value)}
                onBlur={onIncomeBlur}
              />
            </div>
          </div>
          <div className="sf-field sf-age">
            <label>Age</label>
            <input
              type="number"
              min="18"
              max="100"
              aria-label={`${title} age`}
              value={age}
              className={ageError ? "input-error" : ""}
              onChange={(e) => onAgeChange(e.target.value)}
              onBlur={onAgeBlur}
            />
          </div>
        </div>
      )}
      {showMoney && (
        <div className="sf-row">
          {showSelfEmployment && (
            <div className="sf-field sf-grow">
              <label className="sf-label-tip">
                Self-employment
                <span className="sf-label-tooltip">
                  Universal Credit applies a minimum income floor to
                  self-employed earnings, so a pound earned this way can cost
                  more entitlement than a pound of wages.
                </span>
              </label>
              <div className="sf-input-prefix">
                <span>{currencySymbol}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={`${title} self-employment income`}
                  value={selfEmployment}
                  onChange={(e) => onSelfEmploymentChange(e.target.value)}
                  onBlur={onSelfEmploymentBlur}
                />
              </div>
            </div>
          )}
          {showPension && (
            <div className="sf-field sf-grow">
              <label className="sf-label-tip">
                Private pension
                <span className="sf-label-tooltip">
                  Counted as unearned income, which reduces Universal Credit
                  pound for pound rather than through the earnings taper.
                </span>
              </label>
              <div className="sf-input-prefix">
                <span>{currencySymbol}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={`${title} private pension income`}
                  value={pension}
                  onChange={(e) => onPensionChange(e.target.value)}
                  onBlur={onPensionBlur}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {showChecks && (
        <div className="sf-checks">
          {showDisability && (
            <label className="sf-toggle sf-toggle-tip">
              <input
                type="checkbox"
                checked={disabled}
                aria-label={`${title} disabled`}
                onChange={(e) => onDisabledChange(e.target.checked)}
              />
              <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
              Disabled
              <span className="sf-toggle-tooltip">
                Adds the Universal Credit limited capability for work element,
                and makes a couple without children eligible for a work
                allowance, so earnings taper more slowly.
              </span>
            </label>
          )}
          {showCarer && (
            <label className="sf-toggle sf-toggle-tip">
              <input
                type="checkbox"
                checked={carer}
                aria-label={`${title} carer`}
                onChange={(e) => onCarerChange(e.target.checked)}
              />
              <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
              Carer
              <span className="sf-toggle-tooltip">
                Caring for a disabled person at least 35 hours a week adds the
                carer element. It is separate from being disabled yourself, and
                it follows the individual, so it can survive a separation.
              </span>
            </label>
          )}
          {showPregnancy && (
            <label className="sf-toggle">
              <input
                type="checkbox"
                checked={pregnant}
                aria-label={`${title} pregnant`}
                onChange={(e) => onPregnantChange(e.target.checked)}
              />
              <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
              Pregnant
            </label>
          )}
          {showESI && (
            <label className="sf-toggle">
              <input
                type="checkbox"
                checked={hasESI}
                aria-label={`${title} has ESI`}
                onChange={(e) => onESIChange(e.target.checked)}
              />
              <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
              Has ESI
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function PersonSection({
  title, accent, income, onIncomeChange, onIncomeBlur, incomeError,
  age, onAgeChange, onAgeBlur, ageError,
  disabled, onDisabledChange, pregnant, onPregnantChange,
  hasESI, onESIChange, showDisability, showPregnancy, showESI, currencySymbol,
}) {
  return (
    <div className={`sf-person sf-person--${accent}`}>
      <div className="sf-person-title">{title}</div>
      <div className="sf-row">
        <div className="sf-field sf-grow">
          <label className="sf-label-tip">
            Income
            <span className="sf-label-tooltip">Wages and salaries. Enter other income in the fields below where shown.</span>
          </label>
          <div className="sf-income-wrap">
            <span className="sf-dollar">{currencySymbol}</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label={`${title} income`}
              value={income}
              className={incomeError ? "input-error" : ""}
              onChange={(e) => onIncomeChange(e.target.value)}
              onBlur={onIncomeBlur}
            />
          </div>
          {incomeError && <span className="sf-error">{incomeError}</span>}
        </div>
        <div className="sf-field sf-age">
          <label>Age</label>
          <input
            type="number"
            min="18"
            max="100"
            aria-label={`${title} age`}
            value={age}
            className={ageError ? "input-error" : ""}
            onChange={(e) => onAgeChange(e.target.value)}
            onBlur={onAgeBlur}
          />
          {ageError && <span className="sf-error">{ageError}</span>}
        </div>
      </div>
      <div className="sf-checks">
        {showDisability && (
          <label className="sf-toggle">
            <input type="checkbox" checked={disabled} onChange={(e) => onDisabledChange(e.target.checked)} />
            <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
            Disabled
          </label>
        )}
        {showPregnancy && (
          <label className="sf-toggle">
            <input type="checkbox" checked={pregnant} onChange={(e) => onPregnantChange(e.target.checked)} />
            <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
            Pregnant
          </label>
        )}
        {showESI && (
          <label className="sf-toggle sf-toggle-tip">
            <input type="checkbox" checked={hasESI} onChange={(e) => onESIChange(e.target.checked)} />
            <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
            Has ESI
            <span className="sf-toggle-tooltip">Employer-sponsored insurance. If checked, healthcare benefits are excluded from the analysis.</span>
          </label>
        )}
      </div>
    </div>
  );
}
