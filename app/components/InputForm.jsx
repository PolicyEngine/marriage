import React, { useState, useEffect, useRef } from "react";

import { isRentedTenure } from "@/lib/api";
import { getInputSections, getInputSection } from "@/lib/inputSections";
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

function capitaliseFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function joinWithAnd(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const DEFAULT_INCOME = 45000;

export default function InputForm({ country, countries, countryId, onCountryChange, onCalculate, loading, initialValues, section = null, onCancel }) {
  const [activeSection, setActiveSection] = useState(section || "comparison");
  const [furthestStep, setFurthestStep] = useState(0);
  const [followup, setFollowup] = useState(null);
  const [initialCountry] = useState(country.id);
  const formRef = useRef(null);
  const stepHeadingRef = useRef(null);
  const previousSection = useRef(activeSection);
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
  const [headAge, setHeadAge] = useState(iv.headAge != null ? String(iv.headAge) : String(country.defaultAge));
  const [spouseAge, setSpouseAge] = useState(iv.spouseAge != null ? String(iv.spouseAge) : String(country.defaultAge));
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
    stepHeadingRef.current?.focus({ preventScroll: true });
    if (!section && previousSection.current !== activeSection) {
      formRef.current?.scrollIntoView?.({ block: "start" });
    }
    previousSection.current = activeSection;
  }, [activeSection, section]);

  useEffect(() => {
    if (!errors.form && !errors.childcare) return;
    const alert = formRef.current?.querySelector('[role="alert"]');
    if (alert) { alert.tabIndex = -1; alert.focus(); }
  }, [errors, activeSection]);
  const hasPaidChildcare = country.id === "us" && children.some((child) => Number(child.childcareCost) > 0);
  const nondefaultWorkHours = country.id === "us" && (Number(childcareWorkHours.head) !== 40 || Number(childcareWorkHours.spouse) !== 40);
  const adultInputs = ["age"];
  if (country.hasDisability) adultInputs.push(country.id === "us" ? "SSI disability criteria" : "disability");
  if (country.hasPregnancy) adultInputs.push("pregnancy");
  if (country.hasESI) adultInputs.push("ESI status");
  // Owners get no Universal Credit housing element, so the rent field does
  // not apply and must not be deducted from net income either.
  const rentsApply = isRentedTenure(tenureType);

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
      // Country defaults apply only before household answers have been entered.
      if (!section && furthestStep === 0) {
        if (initialValues?.headAge == null) setHeadAge(String(country.defaultAge));
        if (initialValues?.spouseAge == null) setSpouseAge(String(country.defaultAge));
      }
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
  }, [country, section, furthestStep, initialValues]);

  // County and state-specific provider choices cannot survive a state change.
  const previousRegion = useRef(regionCode);
  useEffect(() => {
    if (previousRegion.current === regionCode) return;
    previousRegion.current = regionCode;
    setChildcareCounty("");
    setChildcareActivityEligible(false);
    setChildren((current) => current.map((child) => ({ ...child, childcareProviders: {} })));
  }, [regionCode]);

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

  function updateChild(index, field, value) {
    const updated = [...children];
    updated[index] = { ...updated[index], [field]: value };
    setChildren(updated);
  }

  const data = buildFormData();
  const sections = getInputSections(country, data);
  const stepIndex = Math.max(0, sections.findIndex((item) => item.id === activeSection));
  const current = getInputSection(activeSection);
  const lastStep = stepIndex === sections.length - 1;
  const initialChildren = initialValues?.children || [];
  const childrenChanged = children.length !== initialChildren.length || children.some((child, index) => String(child.age) !== String(initialChildren[index]?.age));
  const comparisonChanged = country.id !== initialCountry || regionCode !== (initialValues?.regionCode || initialValues?.stateCode || country.defaultRegion);
  const needsCareFollowup = Boolean(section && activeSection !== "childcare" && !followup && sections.some((item) => item.id === "childcare") && (
    (section === "comparison" && comparisonChanged) || (section === "household" && childrenChanged)
  ));

  function showError(target, message, fields = {}) {
    if (section && activeSection !== target) setFollowup(section);
    setActiveSection(target);
    setErrors({ ...fields, form: message });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    // Progress navigation can revisit answers without submitting their topic.
    // Check the raw draft again before committing; normalization supplies fallbacks.
    const committing = Boolean(section) || lastStep;
    if (activeSection === "household" || committing) {
      const ageErrors = {};
      for (const [field, value] of [["headAge", headAge], ["spouseAge", spouseAge]]) {
        if (value === "" || !Number.isInteger(Number(value)) || Number(value) < 18 || Number(value) > 100) ageErrors[field] = "Enter a whole-number age from 18 to 100.";
      }
      children.forEach((child, index) => {
        if (child.age === "" || !Number.isInteger(Number(child.age)) || Number(child.age) < 0 || Number(child.age) > 18) ageErrors[`childAge${index}`] = "Enter a whole-number age from 0 to 18.";
      });
      if (Object.keys(ageErrors).length) {
        showError("household", "Check the ages below: adults must be 18–100 and children 0–18, in whole years.", ageErrors);
        return;
      }
    }
    if (country.id === "us" && (activeSection === "work" || committing) && [childcareWorkHours.head, childcareWorkHours.spouse].some((value) => value === "" || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 168)) {
      showError("work", "Enter weekly work hours between 0 and 168 for each adult.");
      return;
    }
    if (!e.currentTarget.reportValidity()) return;
    if (country.id === "us" && (activeSection === "childcare" || lastStep || section)) {
      const error = childCareFormError(data);
      if (error) {
        const target = error.includes("weekly work hours") ? "work" : "childcare";
        showError(target, error);
        return;
      }
    }
    setErrors({});
    if (needsCareFollowup) {
      setFollowup(activeSection);
      setActiveSection("childcare");
    } else if (!section && !lastStep) {
      setActiveSection(sections[stepIndex + 1].id);
      setFurthestStep(Math.max(furthestStep, stepIndex + 1));
    } else {
      onCalculate(data);
    }
  }

  const regionLabel = country.id === "uk" ? "UK nation" : country.regionLabel;
  const comparisonFields = (
    <>
      {countries && onCountryChange && (
        <div className="sf-field">
          <label htmlFor="country">Country</label>
          <FormSelect id="country" label="Country" value={countryId} onValueChange={onCountryChange}
            options={Object.values(countries).map((item) => ({ value: item.id, label: item.name }))} />
        </div>
      )}
      <div className="sf-row">
        <div className="sf-field sf-grow">
          <label htmlFor="region">{regionLabel}</label>
          <FormSelect
            id="region"
            label={regionLabel}
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

      {country.id === "us" ? (
        <fieldset className="journey-comparison">
          <legend>Before marriage, would you live together?</legend>
          {[
            { value: "cohabiting", label: "Living together", description: "Same home, food and resources. Isolates the effect of marriage within a shared household." },
            { value: "separate", label: "Living separately", description: "Separate homes. Includes marriage and combining households; savings on housing costs are not included." },
          ].map((option) => (
            <label className={`journey-choice${livingArrangement === option.value ? " is-selected" : ""}`} key={option.value}>
              <input type="radio" name="living-arrangement" value={option.value} checked={livingArrangement === option.value} onChange={() => setLivingArrangement(option.value)} />
              <span><strong>{option.label}</strong><span>{option.description}</span></span>
            </label>
          ))}
          <p className="journey-note">{livingArrangement === "cohabiting"
            ? "SNAP and other household benefits use a shared household in both scenarios."
            : "The unmarried comparison treats each adult as a separate household."}</p>
        </fieldset>
      ) : <p className="journey-note">Compare living together as a couple with living in separate households. UK benefits generally assess couples who live together, whether or not they are married.</p>}

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
        ageError={errors.headAge}
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
        ageError={errors.spouseAge}
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

      {(
        <p className="journey-note">
          {children.length === 0
            ? "No children included. Add each child whose taxes and benefits you want to include."
            : country.id === "us"
              ? `All children are assumed to be both adults’ children. In the unmarried comparison, you claim all children for taxes.${livingArrangement === "cohabiting" ? " You are assumed to pay more than half the cost of keeping up the home." : " The children and their childcare costs stay with you."}`
              : "When living apart, all children are assumed to live with you."}
        </p>
      )}
    </>
  );

  const extraAdultFields = (showMoney) => (
      <div className="journey-people">
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
          showSelfEmployment={showMoney && country.hasSelfEmployment}
          showPension={showMoney && country.hasPensionIncome}
          showCarer={!showMoney && country.hasCarer}
          usesSSIDisability={country.id === "us"}
          showDisability={!showMoney && country.hasDisability}
          showPregnancy={!showMoney && country.hasPregnancy}
          showESI={!showMoney && country.hasESI}
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
          showSelfEmployment={showMoney && country.hasSelfEmployment}
          showPension={showMoney && country.hasPensionIncome}
          showCarer={!showMoney && country.hasCarer}
          usesSSIDisability={country.id === "us"}
          showDisability={!showMoney && country.hasDisability}
          showPregnancy={!showMoney && country.hasPregnancy}
          showESI={!showMoney && country.hasESI}
        />

      </div>
  );

  const childcareFields = country.id === "us" ? (
    <USChildcareInputs regionCode={regionCode} childEntries={children} updateChild={updateChild}
      hideWork progressive ccdfSlotAvailable={ccdfSlotAvailable} onCcdfSlotAvailableChange={setCcdfSlotAvailable}
      childcareCounty={childcareCounty} onCountyChange={setChildcareCounty}
      childcareWorkHours={childcareWorkHours} onWorkHoursChange={setChildcareWorkHours}
      childcareActivityEligible={childcareActivityEligible} onActivityEligibleChange={setChildcareActivityEligible} />
  ) : (
    <MoneyField label="Annual childcare costs" symbol={country.currencySymbol} value={childcareCosts}
      onChange={(value) => handleIncomeChange(setChildcareCosts, value)} onBlur={() => handleIncomeBlur(setChildcareCosts, childcareCosts, "childcareCosts")} />
  );

  const housingFields = (
    <>
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

      <p className="journey-note">{rentsApply
        ? "Results are after rent. When living apart, each household pays the annual rent entered here."
        : "No rent or mortgage costs are included for owners."}</p>
    </>
  );

  return (
    <form ref={formRef} className="journey-form" onSubmit={handleSubmit} noValidate>
      {!section && <nav className="journey-progress" aria-label="Setup progress">
        <p>Step {stepIndex + 1} of {sections.length}</p>
        <ol>{sections.map((item, index) => <li key={item.id} aria-current={activeSection === item.id ? "step" : undefined} className={index < stepIndex ? "is-complete" : undefined}>
          <button type="button" disabled={index > furthestStep} onClick={() => { setErrors({}); setActiveSection(item.id); }}>{item.label}</button>
        </li>)}</ol>
      </nav>}
      <section className="journey-step" aria-labelledby="journey-step-title" key={activeSection}>
        <h2 id="journey-step-title" className="journey-step-title" tabIndex={-1} ref={stepHeadingRef}>{current.title}</h2>
        <p className="journey-description">{followup && activeSection !== section ? "Review these details to finish updating your household." : current.description}</p>
        {errors.form && <p role="alert" tabIndex={-1} className="sf-childcare-error">{errors.form}</p>}
        {activeSection === "comparison" && comparisonFields}
        {activeSection === "household" && <><div className="journey-people">{adultFields}</div>{childrenFields}</>}
        {activeSection === "circumstances" && <>
          {extraAdultFields(false)}
          {country.id === "us" && <p className="journey-note">SSI disability means meeting its medical criteria and also applies disability status to other programs. Income and resources still affect eligibility.</p>}
          {country.hasESI && <p className="journey-note">Employer health insurance affects healthcare eligibility. Healthcare values are shown separately from financial resources.</p>}
        </>}
        {activeSection === "work" && <>
          <div className="journey-people">{[["head", "Your work hours / week"], ["spouse", "Partner’s work hours / week"]].map(([key, label]) => <div className="sf-field" key={key}>
            <label htmlFor={`work-${key}`}>{label}</label>
            <input id={`work-${key}`} type="number" min="0" max="168" step="any" value={childcareWorkHours[key]} onChange={(event) => setChildcareWorkHours({ ...childcareWorkHours, [key]: event.target.value === "" ? "" : Number(event.target.value) })} />
          </div>)}</div>
          <p className="journey-note">Hours default to 40 for each adult. They stay fixed across the income grid and may affect other benefits as well as childcare assistance.</p>
        </>}
        {activeSection === "childcare" && childcareFields}
        {activeSection === "housing" && housingFields}
        {activeSection === "finances" && <>
          {extraAdultFields(true)}
          {country.hasCapital && <MoneyField label="Savings" symbol={country.currencySymbol} value={savings} onChange={(value) => handleIncomeChange(setSavings, value)} onBlur={() => handleIncomeBlur(setSavings, savings, "savings")} />}
          <p className="journey-note">Savings are split evenly between the adults when living apart.</p>
        </>}
      </section>
      <div className="journey-actions">
        {(section ? followup && activeSection !== section : stepIndex > 0) && <button type="button" className="journey-back" onClick={() => { setErrors({}); setActiveSection(section || sections[stepIndex - 1].id); setFollowup(null); }}>Back</button>}
        {onCancel && <button type="button" className="journey-cancel" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn-calc journey-next" disabled={loading}>
          {loading ? <><span className="spinner" /> Calculating...</> : section ? needsCareFollowup ? "Continue" : "Save changes" : lastStep ? "Calculate" : "Continue"}
        </button>
      </div>
      {(!section && lastStep) && <details className="sf-assumptions">
        <summary className="sf-assumptions-summary">Assumptions</summary>
        <div className="sf-assumptions-body" role="note" aria-label="Model assumptions"><ul className="sf-assumptions-list">{assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>
      </details>}
    </form>
  );
}

function MoneyField({ label, symbol, value, onChange, onBlur }) {
  return <div className="sf-field"><label>{label}</label><div className="sf-input-prefix"><span>{symbol}</span><input type="text" inputMode="numeric" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} /></div></div>;
}

// Reused adult follow-ups, shown separately for circumstances and other income.
function ExtraAdultFields({
  title, accent, currencySymbol,
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
  if (!showMoney && !showChecks) return null;
  return (
    <div className={`sf-extra sf-extra--${accent}`}>
      <div className="sf-extra-title">{title}</div>
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
              Employer health insurance
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function PersonSection({
  title, accent, income, onIncomeChange, onIncomeBlur, incomeError,
  age, onAgeChange, ageError, currencySymbol,
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
          />
          {ageError && <span className="sf-error">{ageError}</span>}
        </div>
      </div>

    </div>
  );
}
