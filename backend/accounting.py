"""Versioned presentation accounting over actual household model outputs.

This module changes no eligibility or payment formula. It distinguishes the
family's financial resources from government-valued health/education services,
and recognizes childcare assistance only to the extent it reduces family costs.
"""

import numpy as np

ACCOUNTING_VERSION = 1
MANDATORY_VARIABLES = (
    "household_market_income",
    "household_net_income",
    "household_net_income_including_health_benefits",
    "household_benefits",
    "household_state_benefits",
    "household_health_benefits",
    "household_head_start_benefits",
    "household_health_costs",
    "household_refundable_tax_credits",
    "household_refundable_state_tax_credits",
    "household_tax_before_refundable_credits",
    "healthcare_benefit_value",
    "child_care_subsidies",
    "childcare_expenses",
    "pre_subsidy_childcare_expenses",
    "vt_ccfap_family_share",
    "head_start",
    "early_head_start",
    "is_head_start_eligible",
    "is_early_head_start_eligible",
)


def build_accounting(simulation, requested, year, model_version):
    """Return one value per household/axis point, in the model's axis order."""
    system = simulation.tax_benefit_system
    values = {}

    def calculate(name):
        if name not in values:
            result = np.asarray(
                simulation.calculate(name, year, map_to="household"), dtype=float
            )
            if not np.isfinite(result).all():
                raise ValueError(f"Nonfinite accounting result: {name}.")
            values[name] = result
        return values[name]

    for _, _, name, _ in requested:
        if system.variables[name].value_type in (int, float, bool):
            calculate(name)
    for name in MANDATORY_VARIABLES:
        calculate(name)

    # Resolve actual model composition for this request's year. The browser's
    # former state/year lookup is neither the authority nor an input here.
    p = system.parameters(year)
    state_benefits = set(p.gov.household.household_state_benefits)
    childcare_programs = set(p.gov.hhs.ccdf.child_care_subsidy_programs)
    included_payments = np.zeros_like(values["child_care_subsidies"])
    for name in sorted(state_benefits & childcare_programs):
        included_payments += calculate(name)

    payments = values["child_care_subsidies"].copy()
    gross = calculate("pre_subsidy_childcare_expenses")
    costs = calculate("childcare_expenses")
    if (gross < 0).any() or (costs < 0).any() or (payments < 0).any():
        raise ValueError(
            "Childcare accounting requires nonnegative costs and payments."
        )
    subsidy = np.minimum(payments, np.maximum(gross - costs, 0))
    deducted_cost = costs + subsidy
    embedded_services = (
        values["household_health_benefits"] + values["household_head_start_benefits"]
    )
    benefits = (
        values["household_benefits"] - included_payments - embedded_services + subsidy
    )
    financial = (
        values["household_market_income"]
        + benefits
        + values["household_refundable_tax_credits"]
        - values["household_tax_before_refundable_credits"]
        - values["household_health_costs"]
        - deducted_cost
    )
    healthcare = values["healthcare_benefit_value"].copy()
    head_start = values["head_start"].copy()
    early_head_start = values["early_head_start"].copy()
    education = head_start + early_head_start

    # Aliases keep existing tables/grids usable, but all money adjustments now
    # happen here. Original unadjusted model outputs remain in response.result.
    values.update(
        household_benefits=benefits,
        household_state_benefits=values["household_state_benefits"] - included_payments,
        household_health_benefits=np.zeros_like(benefits),
        household_head_start_benefits=np.zeros_like(benefits),
        household_net_income=financial,
        household_net_income_including_health_benefits=financial + healthcare,
        financial_resources=financial,
        healthcare_service_value=healthcare,
        early_education_service_value=education,
        combined_resources=financial + healthcare + education,
        child_care_subsidies=subsidy,
        childcare_gross_cost=gross,
        childcare_out_of_pocket=costs,
        childcare_cost_deducted=deducted_cost,
        childcare_provider_payment=payments,
        childcare_family_share=np.where(
            payments > 0, values["vt_ccfap_family_share"], 0
        ),
        head_start_service_value=head_start,
        early_head_start_service_value=early_head_start,
        head_start=np.zeros_like(head_start),
        early_head_start=np.zeros_like(early_head_start),
    )
    return {
        "version": ACCOUNTING_VERSION,
        "model_version": model_version,
        "year": str(year),
        "axis_order": "first_axis_fastest",
        "series": {name: array.tolist() for name, array in values.items()},
    }
