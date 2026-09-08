from copy import deepcopy

import numpy as np
import pytest
from backend.simulation import calculate_household
from backend.tests.test_simulation import household as household_fixture
from backend.tests.test_vermont_copay import infant_household
from backend.web import web_app
from fastapi.testclient import TestClient

household = household_fixture


def assert_reconciled(series):
    financial = np.asarray(series["financial_resources"])
    identity = (
        np.asarray(series["household_market_income"])
        + series["household_benefits"]
        + series["household_refundable_tax_credits"]
        - np.asarray(series["household_tax_before_refundable_credits"])
        - series["household_health_costs"]
        - series["childcare_cost_deducted"]
    )
    np.testing.assert_allclose(financial, identity, atol=0.01)
    np.testing.assert_allclose(series["household_net_income"], financial)
    np.testing.assert_allclose(
        series["household_net_income_including_health_benefits"],
        financial + series["healthcare_service_value"],
    )
    np.testing.assert_allclose(
        series["combined_resources"],
        financial
        + series["healthcare_service_value"]
        + series["early_education_service_value"],
    )
    assert all(type(v) is float for values in series.values() for v in values)
    assert all(np.isfinite(values).all() for values in series.values())


def test_accounting_separates_services_and_sums_multiple_tax_units(household):
    response = calculate_household(household, accounting_version=1)
    accounting = response["accounting"]
    series = accounting["series"]
    raw = response["result"]
    assert accounting["version"] == 1
    assert accounting["year"] == "2026"
    assert accounting["model_version"] == response["model_version"]
    assert series["household_market_income"] == [25000]
    assert series["household_net_income"][0] == pytest.approx(
        raw["households"]["household"]["household_net_income"]["2026"], abs=0.05
    )
    assert series["eitc"][0] == pytest.approx(
        sum(unit["eitc"]["2026"] for unit in raw["tax_units"].values())
    )
    assert series["head_start"] == [0]
    assert series["head_start_service_value"][0] > 0
    assert series["healthcare_service_value"][0] > 0
    assert series["is_head_start_eligible"][0] == 1.0
    assert_reconciled(series)
    # The old endpoint contract remains unmodified and still honors its flag.
    assert "accounting" not in calculate_household(household)
    assert (
        calculate_household(
            household, include_head_start_benefits=True, accounting_version=1
        )["accounting"]
        == accounting
    )


def test_vermont_provider_excess_is_never_financial_income():
    source = infant_household()
    response = calculate_household(
        source, ccdf_participation_filter=True, accounting_version=1
    )
    series = response["accounting"]["series"]
    raw = response["result"]
    assert series["childcare_provider_payment"][0] == pytest.approx(18564, abs=0.05)
    assert series["childcare_family_share"][0] == pytest.approx(2600, abs=0.05)
    assert series["childcare_out_of_pocket"][0] == pytest.approx(2600, abs=0.05)
    assert series["child_care_subsidies"][0] == pytest.approx(10400, abs=0.05)
    assert series["childcare_cost_deducted"][0] == pytest.approx(13000, abs=0.05)
    assert raw["spm_units"]["spm"]["child_care_subsidies"]["2026"] > 18563
    assert_reconciled(series)


@pytest.mark.parametrize("no_funding", [False, True])
def test_accounting_preserves_no_care_and_unfunded_costs(no_funding):
    source = infant_household()
    if no_funding:
        source["spm_units"]["spm"]["vt_child_care_subsidies"]["2026"] = 0
    else:
        source["people"]["paid"]["pre_subsidy_childcare_expenses"]["2026"] = 0
    series = calculate_household(
        source, ccdf_participation_filter=True, accounting_version=1
    )["accounting"]["series"]
    assert series["child_care_subsidies"] == [0]
    assert series["childcare_provider_payment"] == [0]
    assert series["childcare_family_share"] == [0]
    assert series["childcare_cost_deducted"][0] == pytest.approx(
        13000 if no_funding else 0, abs=0.05
    )
    assert_reconciled(series)


def test_accounting_grid_matches_scalars_and_request_state_does_not_leak():
    source = infant_household()
    source["axes"] = [
        [
            {
                "name": "employment_income",
                "count": 2,
                "min": 25000,
                "max": 45000,
                "index": index,
                "period": "2026",
            }
        ]
        for index in (0, 1)
    ]
    grid = calculate_household(
        source, ccdf_participation_filter=True, accounting_version=1
    )["accounting"]
    assert grid["axis_order"] == "first_axis_fastest"
    assert_reconciled(grid["series"])
    for index, (head, partner) in enumerate(
        [(25000, 25000), (45000, 25000), (25000, 45000), (45000, 45000)]
    ):
        point = deepcopy(source)
        point.pop("axes")
        point["people"]["you"]["employment_income"]["2026"] = head
        point["people"]["partner"]["employment_income"]["2026"] = partner
        scalar = calculate_household(
            point, ccdf_participation_filter=True, accounting_version=1
        )["accounting"]["series"]
        for name, values in scalar.items():
            assert grid["series"][name][index] == pytest.approx(values[0], abs=0.05)
    assert (
        calculate_household(
            source, ccdf_participation_filter=True, accounting_version=1
        )["accounting"]
        == grid
    )


def test_http_accounting_versions_and_numeric_boolean_outputs(household):
    client = TestClient(web_app)
    response = client.post(
        "/us/calculate", json={"household": household, "accounting_version": 1}
    )
    assert response.status_code == 200
    assert_reconciled(response.json()["accounting"]["series"])
    for value in (True, "1", 2, 0):
        assert (
            client.post(
                "/us/calculate",
                json={"household": household, "accounting_version": value},
            ).status_code
            == 422
        )
