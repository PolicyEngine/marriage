import { getInputSections } from "@/lib/inputSections";
import { formatCurrency, formatYearLabel } from "@/lib/utils";

const EDIT_LABELS = {
  circumstances: "health and disability", work: "work hours", childcare: "childcare",
  housing: "housing", finances: "other income and savings",
};

export default function HouseholdSummary({ country, data, onEdit }) {
  const money = value => formatCurrency(Number(value) || 0, false, country.currencySymbol);
  const region = data.regionCode || data.stateCode;
  const regionName = country.regions.find(item => item.code === region)?.name || region;
  const children = data.children || [];
  const living = country.id === "uk" ? "Together vs apart" : data.livingArrangement === "cohabiting" ? "Living together" : "Living separately";
  const childSummary = children.length ? `${children.length} ${children.length === 1 ? "child" : "children"}, ${children.length === 1 ? "age" : "ages"} ${children.map(child => child.age).join(", ")}` : "No children";
  const circumstances = [];
  for (const [key, name] of [["head", "You"], ["spouse", "Partner"]]) {
    if (data.disabilityStatus?.[key]) circumstances.push(`${name}: ${country.id === "us" ? "SSI disability" : "disabled"}`);
    if (data.pregnancyStatus?.[key] && country.hasPregnancy) circumstances.push(`${name}: pregnant`);
    if (data.esiStatus?.[key] && country.hasESI) circumstances.push(`${name}: employer health insurance`);
    if (data.carerStatus?.[key] && country.hasCarer) circumstances.push(`${name}: carer`);
  }
  children.forEach((child, index) => {
    if (child.isDisabled) circumstances.push(`Child ${index + 1}: ${country.id === "us" ? "SSI disability" : "disabled"}`);
  });
  const careCost = country.id === "us" ? children.reduce((total, child) => total + (Number(child.childcareCost) || 0), 0) : data.childcareCosts;
  const tenure = {
    OWNED_OUTRIGHT: "Owned outright", OWNED_WITH_MORTGAGE: "Owned with a mortgage",
    RENT_PRIVATELY: "Private rent", RENT_FROM_COUNCIL: "Council rent", RENT_FROM_HA: "Housing association rent",
  }[data.tenureType || "OWNED_OUTRIGHT"];
  const total = values => (Number(values?.head) || 0) + (Number(values?.spouse) || 0);
  const descriptions = {
    circumstances: circumstances.join(" · ") || "None selected",
    work: `You: ${data.childcareWorkHours?.head ?? 40} hours/week · Partner: ${data.childcareWorkHours?.spouse ?? 40} hours/week`,
    childcare: `${money(careCost)} a year${country.id === "us" && careCost > 0 ? ` · CCDF slot ${data.ccdfSlotAvailable === false ? "unavailable" : "available"}` : ""}${children.some(child => child.isHeadStartEnrolled) ? " · Head Start enrolled" : ""}`,
    housing: `${tenure}${data.tenureType?.startsWith("RENT_") ? ` · ${money(data.rent)} a year per home` : ""}`,
    finances: `${money(total(data.selfEmploymentIncome))} self-employment · ${money(total(data.pensionIncome))} pensions · ${money(data.savings)} savings`,
  };
  const editButton = (id, label) => <button type="button" className="household-edit-link" aria-label={`Edit ${label}`} onClick={event => onEdit(id, event)}>Edit</button>;

  return <section className="household-summary" aria-label="Your household">
    <div className="household-summary-primary">
      <div className="household-summary-item">
        <div className="household-summary-heading"><h2>Comparison</h2>{editButton("comparison", "comparison")}</div>
        <p>{regionName} · {formatYearLabel(data.year || country.defaultYear, country.id)} · {living}</p>
      </div>
      <div className="household-summary-item">
        <div className="household-summary-heading"><h2>Household</h2>{editButton("household", "household")}</div>
        <p>You: {money(data.headIncome)} · Partner: {money(data.spouseIncome)} a year</p>
        <p className="household-summary-secondary">Ages {data.headAge ?? country.defaultAge} and {data.spouseAge ?? country.defaultAge} · {childSummary}</p>
      </div>
    </div>
    <details className="household-summary-details">
      <summary>Other household details</summary>
      <dl>{getInputSections(country, data).filter(item => EDIT_LABELS[item.id]).map(item => <div className="household-detail-row" key={item.id}>
        <dt>{item.label}</dt><dd>{descriptions[item.id]}</dd>{editButton(item.id, EDIT_LABELS[item.id])}
      </div>)}</dl>
    </details>
  </section>;
}
