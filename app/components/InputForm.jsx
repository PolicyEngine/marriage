import React, { useState, useEffect, useRef } from "react";

import { isRentedTenure } from "@/lib/api";
import { formatYearLabel } from "@/lib/utils";
import { UK_BRMAS, DEFAULT_BRMA } from "@/lib/countries";
import FormSelect from "./FormSelect";
import USChildcareInputs, { childCareFormError, normalizeChildcareChild } from "./USChildcareInputs";

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

export default function InputForm({ country, countries, countryId, onCountryChange, onCalculate, onInputChange, loading, initialValues, externalIncomes, mode = "editor", onExitWizard }) {
  const isWizard = mode === "wizard";
  const [wizardStep, setWizardStep] = useState(0);
  const formRef = useRef(null);
  const stepHeadingRef = useRef(null);
  const previousStep = useRef(wizardStep);
  const previousWizard = useRef(isWizard);
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
  const [ccdfSlotAvailable, setCcdfSlotAvailable] = useState(iv.ccdfSlotAvailable !== false);
  const [childcareCounty, setChildcareCounty] = useState(iv.childcareCounty || "");
  const [childcareWorkHours, setChildcareWorkHours] = useState(iv.childcareWorkHours || { head: 40, spouse: 40 });
  const [includeHeadStart, setIncludeHeadStart] = useState(iv.includeHeadStart || false);
  const [childcareActivityEligible, setChildcareActivityEligible] = useState(iv.childcareActivityEligible || false);
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
  useEffect(() => {
    if (isWizard && (!previousWizard.current || previousStep.current !== wizardStep)) {
      stepHeadingRef.current?.focus({ preventScroll: true });
      formRef.current?.scrollIntoView?.({ block: "start" });
    }
    previousStep.current = wizardStep;
    previousWizard.current = isWizard;
  }, [isWizard, wizardStep]);

  useEffect(() => {
    if (!errors.form && !errors.childcare) return;
    const alert = formRef.current?.querySelector('[role="alert"]');
    if (alert) {
      alert.tabIndex = -1;
      alert.focus();
    }
  }, [errors, wizardStep]);
  const previousInputs = useRef(null);
  const syncedIncomes = useRef(null);
  const childrenKey = JSON.stringify(children);
  const childcareWorkHoursKey = JSON.stringify(childcareWorkHours);
  const hasPaidChildcare = country.id === "us" && children.some((child) => Number(child.childcareCost) > 0);
  const nondefaultWorkHours = country.id === "us" && (Number(childcareWorkHours.head) !== 40 || Number(childcareWorkHours.spouse) !== 40);
  const adultInputs = ["age"];
  if (country.hasDisability) adultInputs.push(country.id === "us" ? "SSI disability criteria" : "disability");
  if (country.hasPregnancy) adultInputs.push("pregnancy");
  if (country.hasESI) adultInputs.push("ESI status");
  // Owners get no Universal Credit housing element, so the rent field does
  // not apply and must not be deducted from net income either.
  const rentsApply = isRentedTenure(tenureType);

  // Everything under "More details" is optional and country-gated. The badge
  // counts how many are actually set, so a collapsed panel never hides an
  // input that is changing the result.
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
    country.id === "us" && !ccdfSlotAvailable,
    hasPaidChildcare,
    country.id === "us" && Boolean(childcareCounty),
    nondefaultWorkHours,
    country.id === "us" && includeHeadStart,
    children.length > 0,
  ].filter(Boolean).length;

  const householdInputs = [];
  if (country.hasHousing) householdInputs.push("rent and tenure type");
  if (country.hasChildcare || hasPaidChildcare) householdInputs.push("childcare costs");
  if ((hasPaidChildcare || nondefaultWorkHours)) adultInputs.push("weekly work hours");
  if (country.hasCapital) householdInputs.push("savings");
  if (country.hasSelfEmployment) adultInputs.push("self-employment income");
  if (country.hasPensionIncome) adultInputs.push("private pension income");
  if (country.hasCarer) adultInputs.push("carer status");

  const omitted = ["deductions"];
  if (!country.hasSelfEmployment) omitted.unshift("self-employment income");
  if (!country.hasHousing) omitted.unshift("rent");
  if (!country.hasChildcare && !hasPaidChildcare) omitted.unshift("childcare expenses");
  if (!country.hasCapital) omitted.unshift("savings and capital");
  if (!country.hasPensionIncome) omitted.unshift("unearned income");

  const separateLabel = country.id === "uk" ? "living-apart" : "unmarried";
  const assumptions = [
    `The calculator uses only the inputs shown here: ${country.regionLabel.toLowerCase()}, year, each adult's wages, ${joinWithAnd(adultInputs)}${householdInputs.length ? `, the household's ${joinWithAnd(householdInputs)}` : ""}, and each child's ${country.hasDisability && country.id !== "uk" ? "age and disability" : "age"}.`,
    `Earnings mean wages and salaries only. ${capitaliseFirst(joinWithAnd([...omitted, "other omitted inputs"]))} are assumed to be zero.`,
  ];
  if (country.id === "us") {
    assumptions.push("All children are assumed to be both adults' children.");
    assumptions.push("SSI disability criteria describe medical disability, not financial eligibility. The model still applies earnings, income, resources, and other eligibility rules; resources are assumed to be zero.");
    if (hasPaidChildcare) assumptions.push("Childcare costs are annual prices before subsidies, excluding free Head Start hours. Children and their childcare costs stay with you in the separate-household comparison. Costs still apply when a funded childcare slot is unavailable.");
    if (hasPaidChildcare || nondefaultWorkHours) assumptions.push("Work hours stay fixed as the income grid varies and may affect childcare assistance and other benefits.");
    if (includeHeadStart) assumptions.push("Head Start and Early Head Start amounts are modeled service values for eligible enrollment, not cash payments or guaranteed places.");
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
    assumptions.push("Employer-sponsored insurance affects each adult’s healthcare eligibility. Healthcare values are shown separately from financial resources.");
  }

  // Reset region and defaults when country changes
  const prevCountryId = useRef(country.id);
  useEffect(() => {
    if (prevCountryId.current !== country.id) {
      prevCountryId.current = country.id;
      setRegionCode(country.defaultRegion);
      setYear(country.defaultYear);
      setLivingArrangement("cohabiting");
      setCcdfSlotAvailable(true);
      setChildcareCounty("");
      setChildcareWorkHours({ head: 40, spouse: 40 });
      setIncludeHeadStart(false);
      setChildcareActivityEligible(false);
      setChildren((current) => current.map((child) => ({ age: child.age, isDisabled: child.isDisabled })));
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

  // County and state-specific provider choices cannot survive a state change.
  const previousRegion = useRef(regionCode);
  useEffect(() => {
    if (previousRegion.current === regionCode) return;
    previousRegion.current = regionCode;
    setChildcareCounty("");
    setChildcareActivityEligible(false);
    setChildren((current) => current.map((child) => ({ ...child, childcareProviders: {} })));
  }, [regionCode]);

  // Clear stale results when inputs change (but not on initial mount)
  useEffect(() => {
    const inputs = [regionCode, headIncome, spouseIncome, headAge, spouseAge,
      headDisabled, spouseDisabled, headPregnant, spousePregnant, headESI, spouseESI, year, childrenKey, livingArrangement,
      ccdfSlotAvailable, childcareCounty, childcareWorkHoursKey, includeHeadStart, childcareActivityEligible,
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
    ccdfSlotAvailable, childcareCounty, childcareWorkHoursKey, includeHeadStart, childcareActivityEligible,
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
      children: children.map((c) => country.id === "us"
        ? normalizeChildcareChild({ ...c, age: Number(c.age) || 0 }, regionCode)
        : { age: Number(c.age) || 0, isDisabled: c.isDisabled || false }),
      disabilityStatus: { head: headDisabled, spouse: spouseDisabled },
      ...(country.id === "us" ? { ccdfSlotAvailable, childcareCounty, childcareWorkHours, includeHeadStart, childcareActivityEligible: regionCode === "NV" && childcareActivityEligible } : {}),
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
    if (isWizard) return;
    let num = Number(value);
    if (Number.isNaN(num) || value === "") num = country.defaultAge;
    const clamped = clamp(Math.round(num), 18, 100);
    setter(String(clamped));
    if (num < 18 || num > 100) setError(field, "18\u2013100");
  }

  function handleChildAgeBlur(index, value) {
    if (isWizard) return;
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
    if (loading) return;
    if (isWizard && wizardStep > 0) {
      const ageErrors = {};
      for (const [field, value] of [["headAge", headAge], ["spouseAge", spouseAge]]) {
        if (value === "" || !Number.isInteger(Number(value)) || Number(value) < 18 || Number(value) > 100) {
          ageErrors[field] = "Enter a whole-number age from 18 to 100.";
        }
      }
      children.forEach((child, index) => {
        if (child.age === "" || !Number.isInteger(Number(child.age)) || Number(child.age) < 0 || Number(child.age) > 18) {
          ageErrors[`childAge${index}`] = "Enter a whole-number age from 0 to 18.";
        }
      });
      if (Object.keys(ageErrors).length > 0) {
        setErrors({ ...ageErrors, form: "Check the ages below: adults must be 18–100 and children 0–18, in whole years." });
        setWizardStep(1);
        return;
      }
    }
    if (isWizard && !e.currentTarget.reportValidity()) return;
    if (isWizard && wizardStep < 2) {
      setErrors({});
      setWizardStep(wizardStep + 1);
      return;
    }
    const data = buildFormData();
    const childcareError = country.id === "us" ? childCareFormError(data) : null;
    if (childcareError) {
      setErrors((current) => ({ ...current, childcare: childcareError }));
      const details = e.currentTarget.querySelector(".sf-more");
      if (details) details.open = true;
      return;
    }
    setErrors({});
    onCalculate(data);
  }

  const comparisonFields = (
    <>
      {countries && (
        <div className="sf-field">
          <div className="country-toggle">
            {Object.values(countries).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`country-toggle-btn${countryId === c.id ? " active" : ""}`}
                aria-pressed={countryId === c.id}
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

      {isWizard && (
        <p className="wizard-comparison-note">
          {country.id === "uk"
            ? "Compare living together as a couple with living in separate households. UK benefits generally assess couples who live together, whether or not they are married."
            : livingArrangement === "cohabiting"
              ? "Compare being married with being unmarried while sharing a home, food and resources. Household benefits such as SNAP use a shared household in both scenarios."
              : "Compare being married and living together with being unmarried in separate homes. This includes the effect of combining households. Savings from sharing housing costs are not included."}
        </p>
      )}
    </>
  );

  const adultFields = (
    <>
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
    </>
  );

  const childrenFields = (
    <>
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
          <div className={`sf-child${country.id === "us" ? " sf-child--us" : ""}`} key={i}>
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
                checked={child.isDisabled || false}
                aria-label={`Child ${i + 1} ${country.id === "us" ? "meets SSI disability criteria" : "disabled"}`}
                onChange={(e) => updateChild(i, "isDisabled", e.target.checked)}
              />
              <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
              {country.id === "us" ? "Meets SSI disability criteria" : "Disabled"}
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

      {isWizard && (
        <p className="wizard-default-note">
          {children.length === 0
            ? "No children included. Add each child whose taxes and benefits you want to include."
            : country.id === "us"
              ? `All children are assumed to be both adults’ children. In the unmarried comparison, you claim all children for taxes.${livingArrangement === "cohabiting" ? " You are assumed to pay more than half the cost of keeping up the home." : " The children and their childcare costs stay with you."}`
              : "When living apart, all children are assumed to live with you."}
        </p>
      )}
    </>
  );

  const detailsFields = (
    <>
      <div className={isWizard ? "wizard-adult-details" : "sf-more-people"}>
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
          usesSSIDisability={country.id === "us"}
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
          usesSSIDisability={country.id === "us"}
          showDisability={country.hasDisability}
          showPregnancy={country.hasPregnancy}
          showESI={country.hasESI}
        />

      </div>
      {isWizard && country.hasESI && (
        <p className="wizard-default-note">Has ESI means employer-sponsored health insurance. Leave it off for an adult without that coverage. Healthcare values appear separately from financial resources.</p>
      )}
      {!isWizard && childrenFields}
      {country.id === "us" && (
        <USChildcareInputs
          regionCode={regionCode} childEntries={children} updateChild={updateChild}
          hideChildcare={isWizard && children.length === 0 && !childcareCounty}
          progressive={isWizard}
          ccdfSlotAvailable={ccdfSlotAvailable} onCcdfSlotAvailableChange={setCcdfSlotAvailable}
          childcareCounty={childcareCounty} onCountyChange={setChildcareCounty}
          childcareWorkHours={childcareWorkHours} onWorkHoursChange={setChildcareWorkHours}
          includeHeadStart={includeHeadStart} onIncludeHeadStartChange={setIncludeHeadStart}
          childcareActivityEligible={childcareActivityEligible} onActivityEligibleChange={setChildcareActivityEligible}
          error={errors.childcare}
        />
      )}

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
            {country.hasChildcare && (!isWizard || children.length > 0 || parseNumber(childcareCosts) > 0) && (
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
      {isWizard && country.hasHousing && (
        <p className="wizard-default-note">
          {rentsApply
            ? "Results are after rent. When living apart, each household pays the annual rent entered here. Savings are split evenly between the adults."
            : "No rent or mortgage costs are included for owners. Savings are split evenly between the adults when living apart."}
        </p>
      )}
    </>
  );

  const stepTitles = ["Choose your comparison", "Describe your household", "Add relevant details"];
  const stepDescriptions = [
    "Choose where you live and what you want to compare.",
    "Enter annual wages and salaries before tax for each adult, then add your children.",
    "Review the defaults below and change the details that apply to your household.",
  ];

  return (
    <form ref={formRef} className={`sidebar-form${isWizard ? " wizard-form" : ""}`} onSubmit={handleSubmit} noValidate={isWizard}>
      {isWizard ? (
        <>
          <nav className="wizard-progress" aria-label="Setup progress">
            <ol>
              {["Comparison", "Household", "Details"].map((label, index) => (
                <li key={label} aria-current={index === wizardStep ? "step" : undefined} className={index < wizardStep ? "is-complete" : undefined}>
                  <span className="wizard-step-number" aria-hidden="true">{index + 1}</span>
                  <span>{label}</span>
                </li>
              ))}
            </ol>
          </nav>
          <section className="wizard-step" aria-labelledby="wizard-step-title" key={wizardStep}>
            <h2 className="wizard-step-title" id="wizard-step-title" tabIndex={-1} ref={stepHeadingRef}>{stepTitles[wizardStep]}</h2>
            <p className="wizard-description">{stepDescriptions[wizardStep]}</p>
            {errors.form && <p role="alert" tabIndex={-1} className="sf-childcare-error">{errors.form}</p>}
            {wizardStep === 0 && comparisonFields}
            {wizardStep === 1 && (
              <>
                <div className="wizard-household">{adultFields}</div>
                {childrenFields}
              </>
            )}
            {wizardStep === 2 && detailsFields}
          </section>
          <div className="wizard-actions">
            {wizardStep > 0 && <button type="button" className="wizard-back" onClick={() => { setErrors({}); setWizardStep(wizardStep - 1); }}>Back</button>}
            <button type="submit" className="btn-calc wizard-next" disabled={loading}>
              {loading ? <><span className="spinner" /> Calculating...</> : wizardStep === 2 ? "Calculate" : "Continue"}
            </button>
          </div>
          {onExitWizard && <button type="button" className="wizard-skip" onClick={onExitWizard}>Use full form</button>}
        </>
      ) : (
        <>
          {comparisonFields}
          {adultFields}
          <details className="sf-more">
            <summary className="sf-more-summary">
              More details
              {extrasInUse > 0 && <span className="sf-more-badge">{extrasInUse}</span>}
            </summary>
            <div className="sf-more-body">{detailsFields}</div>
          </details>
          <button type="submit" className="btn-calc" disabled={loading}>
            {loading ? <><span className="spinner" /> Calculating...</> : "Calculate"}
          </button>
        </>
      )}
      {(!isWizard || wizardStep === 2) && (
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
      )}
    </form>
  );
}

// Shared adult follow-ups for the guided details step and the results editor.
function ExtraAdultFields({
  title, accent, currencySymbol,
  income, onIncomeChange, onIncomeBlur, incomeError, showIncome,
  age, onAgeChange, onAgeBlur, ageError,
  selfEmployment, onSelfEmploymentChange, onSelfEmploymentBlur, showSelfEmployment,
  pension, onPensionChange, onPensionBlur, showPension,
  carer, onCarerChange, showCarer,
  disabled, onDisabledChange, showDisability,
  usesSSIDisability,
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
      {usesSSIDisability && <p className="sf-input-note">SSI medical criteria only. Also applies disability status to other programs; earnings, income, and resources still affect eligibility.</p>}
      {showChecks && (
        <div className="sf-checks">
          {showDisability && (
            <label className="sf-toggle sf-toggle-tip">
              <input
                type="checkbox"
                checked={disabled}
                aria-label={`${title} ${usesSSIDisability ? "meets SSI disability criteria" : "disabled"}`}
                onChange={(e) => onDisabledChange(e.target.checked)}
              />
              <span className="sf-toggle-track"><span className="sf-toggle-thumb" /></span>
              {usesSSIDisability ? "Meets SSI disability criteria" : "Disabled"}
              <span className="sf-toggle-tooltip">
                {usesSSIDisability
                  ? "Meets SSI medical disability criteria. Also sets general disability status for other programs; earnings, income, and resources still affect eligibility."
                  : "Adds the Universal Credit limited capability for work element, and makes a couple without children eligible for a work allowance, so earnings taper more slowly."}
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
            <span className="sf-toggle-tooltip">Employer-sponsored insurance affects healthcare eligibility. Healthcare values are shown separately from financial resources.</span>
          </label>
        )}
      </div>
    </div>
  );
}
