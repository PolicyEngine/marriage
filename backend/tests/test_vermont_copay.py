from copy import deepcopy

import pytest
from backend.simulation import calculate_household
from backend.tests.test_vermont_participation import vermont_household


def infant_household():
    household = vermont_household()
    keep = {"you", "partner", "paid"}
    household["people"] = {
        key: value for key, value in household["people"].items() if key in keep
    }
    for key, groups in list(household.items()):
        if key == "people":
            continue
        for name, group in list(groups.items()):
            group["members"] = [member for member in group["members"] if member in keep]
            if not group["members"]:
                groups.pop(name)
    for name in ["you", "partner"]:
        household["people"][name]["employment_income"]["2026"] = 25000
    child = household["people"]["paid"]
    child["age"]["2026"] = 1
    child["pre_subsidy_childcare_expenses"]["2026"] = 13000
    child["vt_ccfap_provider_type"]["2026"] = "REGISTERED_HOME"
    spm = household["spm_units"]["spm"]
    for variable in [
        "childcare_expenses",
        "vt_ccfap_family_share",
        "snap_dependent_care_deduction",
        "snap",
    ]:
        spm[variable] = {"2026": None}
    for variable in [
        "tax_unit_childcare_expenses",
        "cdcc_relevant_expenses",
        "cdcc",
        "income_tax",
    ]:
        household["tax_units"]["tax"][variable] = {"2026": None}
    household["households"]["household"]["household_net_income"] = {"2026": None}
    return household


def test_collectible_share_reaches_snap_and_cdcc_without_changing_payments():
    household = infant_household()
    before = calculate_household(household)["result"]
    corrected = calculate_household(household, ccdf_participation_filter=True)["result"]
    spm = corrected["spm_units"]["spm"]
    taxes = corrected["tax_units"]["tax"]
    assert spm["vt_child_care_subsidies"]["2026"] == pytest.approx(18564, abs=0.02)
    assert spm["vt_ccfap_family_share"]["2026"] == pytest.approx(2600, abs=0.02)
    assert spm["childcare_expenses"]["2026"] == pytest.approx(2600, abs=0.02)
    assert spm["snap_dependent_care_deduction"]["2026"] == pytest.approx(2600, abs=0.02)
    assert taxes["tax_unit_childcare_expenses"]["2026"] == pytest.approx(2600, abs=0.02)
    assert taxes["cdcc_relevant_expenses"]["2026"] == pytest.approx(2600, abs=0.02)
    assert taxes["cdcc"]["2026"] > before["tax_units"]["tax"]["cdcc"]["2026"]
    # CCFAP income excludes SNAP and tax credits. Recomputing those downstream
    # results must not change the provider payment or create circular feedback.
    for name in ["vt_child_care_subsidies", "vt_ccfap_family_share"]:
        assert spm[name] == before["spm_units"]["spm"][name]
    assert calculate_household(household)["result"] == before


def test_collectible_share_changes_final_snap_when_close_to_benefit_threshold():
    household = infant_household()
    for name in ["you", "partner"]:
        household["people"][name]["employment_income"]["2026"] = 24000
    household["people"]["you"]["rent"] = {"2026": 36000}
    before = calculate_household(household)["result"]["spm_units"]["spm"]
    corrected = calculate_household(household, ccdf_participation_filter=True)[
        "result"
    ]["spm_units"]["spm"]
    assert corrected["childcare_expenses"]["2026"] > 0
    assert corrected["snap"]["2026"] > before["snap"]["2026"]


@pytest.mark.parametrize("filter_enabled", [False, True])
def test_unfunded_place_preserves_gross_cost_and_does_not_charge_family_share(
    filter_enabled,
):
    household = infant_household()
    household["spm_units"]["spm"]["vt_child_care_subsidies"]["2026"] = 0
    result = calculate_household(household, ccdf_participation_filter=filter_enabled)[
        "result"
    ]
    spm = result["spm_units"]["spm"]
    assert spm["child_care_subsidies"]["2026"] == 0
    assert spm["vt_ccfap_family_share"]["2026"] > 0
    assert spm["childcare_expenses"]["2026"] == pytest.approx(13000, abs=0.02)
    assert spm["snap_dependent_care_deduction"]["2026"] == pytest.approx(
        13000, abs=0.02
    )


def test_no_paid_child_has_no_phantom_family_share_expense():
    household = infant_household()
    child = household["people"]["paid"]
    child["pre_subsidy_childcare_expenses"]["2026"] = 0
    child["childcare_hours_per_day"]["2026"] = 0
    child["childcare_days_per_week"]["2026"] = 0
    spm = calculate_household(household, ccdf_participation_filter=True)["result"][
        "spm_units"
    ]["spm"]
    assert spm["vt_ccfap_family_share"]["2026"] > 0
    assert spm["child_care_subsidies"]["2026"] == 0
    assert spm["childcare_expenses"]["2026"] == 0


def test_monthly_copayment_expenses_and_final_benefits_match_income_grid():
    household = infant_household()
    household["axes"] = [
        [
            {
                "name": "employment_income",
                "count": 2,
                "min": 25000,
                "max": 45000,
                "index": 0,
                "period": "2026",
            }
        ],
        [
            {
                "name": "employment_income",
                "count": 2,
                "min": 25000,
                "max": 45000,
                "index": 1,
                "period": "2026",
            }
        ],
    ]
    grid = calculate_household(household, ccdf_participation_filter=True)["result"]
    for index, (head, partner) in enumerate(
        [(25000, 25000), (45000, 25000), (25000, 45000), (45000, 45000)]
    ):
        point = deepcopy(household)
        point.pop("axes")
        point["people"]["you"]["employment_income"]["2026"] = head
        point["people"]["partner"]["employment_income"]["2026"] = partner
        scalar = calculate_household(point, ccdf_participation_filter=True)["result"]
        for entity, entity_id, variables in [
            (
                "spm_units",
                "spm",
                [
                    "childcare_expenses",
                    "snap_dependent_care_deduction",
                    "snap",
                    "vt_ccfap_family_share",
                    "child_care_subsidies",
                ],
            ),
            ("tax_units", "tax", ["cdcc_relevant_expenses", "cdcc", "income_tax"]),
            ("households", "household", ["household_net_income"]),
        ]:
            for variable in variables:
                assert grid[entity][entity_id][variable]["2026"][
                    index
                ] == pytest.approx(
                    scalar[entity][entity_id][variable]["2026"], abs=0.05
                )
