const SECTIONS = {
  comparison: { id: "comparison", label: "Comparison", title: "What would you like to compare?", description: "Choose your location and the households to compare." },
  household: { id: "household", label: "Household", title: "Who is in your household?", description: "Enter each adult’s annual wages before tax and add your children." },
  circumstances: { id: "circumstances", label: "Health and care", title: "Do any of these apply?", description: "These details can affect taxes and benefit eligibility. Leave off anything that does not apply." },
  work: { id: "work", label: "Work", title: "How many hours do you work?", description: "Enter your usual weekly hours, including zero if you do not work." },
  childcare: { id: "childcare", label: "Childcare", title: "Do you pay for childcare?", description: "Enter annual costs before subsidies. Leave costs at zero if you do not pay for care." },
  housing: { id: "housing", label: "Housing", title: "What are your housing costs?", description: "Your housing situation affects Universal Credit and resources after rent." },
  finances: { id: "finances", label: "Other income and savings", title: "Do you have other income or savings?", description: "Enter annual income and your combined savings. Leave amounts at zero where they do not apply." },
};

export function getInputSections(country, data = {}) {
  const sections = [SECTIONS.comparison, SECTIONS.household, SECTIONS.circumstances];
  if (country.id === "us") sections.push(SECTIONS.work);
  if ((data.children || []).length || Number(data.childcareCosts) > 0 || data.childcareCounty) sections.push(SECTIONS.childcare);
  if (country.hasHousing) sections.push(SECTIONS.housing);
  if (country.hasCapital || country.hasSelfEmployment || country.hasPensionIncome) sections.push(SECTIONS.finances);
  return sections;
}

export function getInputSection(id) { return SECTIONS[id]; }
