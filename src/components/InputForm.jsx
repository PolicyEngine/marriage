import React, { useState, useEffect, useRef } from "react";

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
  const [errors, setErrors] = useState({});
  const hasMounted = useRef(false);
  const childrenKey = children.map((c) => `${c.age}:${c.isDisabled}`).join(",");
  const adultInputs = ["age"];
  if (country.hasDisability) adultInputs.push("disability");
  if (country.hasPregnancy) adultInputs.push("pregnancy");
  if (country.hasESI) adultInputs.push("ESI status");
  const assumptions = [
    `The calculator uses only the inputs shown here: ${country.regionLabel.toLowerCase()}, year, each adult's wages, ${joinWithAnd(adultInputs)}, and each child's ${country.hasDisability ? "age and disability" : "age"}.`,
    "Income means wages and salaries only. Unearned income, self-employment income, rent, childcare expenses, deductions, and other omitted income or expense inputs are assumed to be zero.",
    "For the unmarried comparison, all children are assigned to you and your partner is simulated separately without children.",
  ];
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
      if (!country.hasESI) {
        setHeadESI(false);
        setSpouseESI(false);
      }
    }
  }, [country]);

  // Clear stale results when inputs change (but not on initial mount)
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (onInputChange) onInputChange();
  }, [regionCode, headIncome, spouseIncome, headAge, spouseAge,
    headDisabled, spouseDisabled, headESI, spouseESI, year, childrenKey]);

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
    };
  }

  // Sync income fields when heatmap cell is clicked
  useEffect(() => {
    if (externalIncomes) {
      setHeadIncome(formatIncome(externalIncomes.headIncome));
      setSpouseIncome(formatIncome(externalIncomes.spouseIncome));
    }
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
          <label>{country.regionLabel}</label>
          <select value={regionCode} onChange={(e) => setRegionCode(e.target.value)}>
            {country.regions.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="sf-field sf-year">
          <label>Year</label>
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {country.availableYears.map((y) => (
              <option key={y} value={y}>{country.id === "uk" ? `${y}-${(Number(y) + 1).toString().slice(2)}` : y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="sf-assumptions" role="note" aria-label="Model assumptions">
        <div className="sf-assumptions-title">Assumptions</div>
        <ul className="sf-assumptions-list">
          {assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

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
        showDisability={country.hasDisability}
        showPregnancy={country.hasPregnancy}
        showESI={country.hasESI}
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
        disabled={spouseDisabled}
        onDisabledChange={setSpouseDisabled}
        pregnant={spousePregnant}
        onPregnantChange={setSpousePregnant}
        hasESI={spouseESI}
        onESIChange={setSpouseESI}
        showDisability={country.hasDisability}
        showPregnancy={country.hasPregnancy}
        showESI={country.hasESI}
        currencySymbol={country.currencySymbol}
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
              onClick={() => setChildren(children.filter((_, j) => j !== i))}
            >&times;</button>
          </div>
        ))}
      </div>

      <button type="submit" className="btn-calc" disabled={loading}>
        {loading ? <><span className="spinner" /> Calculating...</> : "Calculate"}
      </button>
    </form>
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
            <span className="sf-label-tooltip">Wages and salaries only. Other inputs (unearned income, rent, childcare expenses, etc.) are assumed to be zero.</span>
          </label>
          <div className="sf-income-wrap">
            <span className="sf-dollar">{currencySymbol}</span>
            <input
              type="text"
              inputMode="numeric"
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
