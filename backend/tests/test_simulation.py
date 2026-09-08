import json
from copy import deepcopy
from unittest.mock import patch

import pytest
from backend.simulation import (
    MAX_PAYLOAD_BYTES,
    MODEL_VERSION,
    InvalidHousehold,
    build_metadata,
    calculate_household,
    get_system,
)
from backend.web import web_app
from fastapi.testclient import TestClient
from policyengine_us import Simulation


@pytest.fixture
def household():
    return {
        "people": {
            "you": {
                "age": {"2026": 40},
                "employment_income": {"2026": 15000},
                "is_ssi_disabled": {"2026": True},
                "ssi": {"2026": None},
            },
            "partner": {"age": {"2026": 40}, "employment_income": {"2026": 10000}},
            "child": {"age": {"2026": 3}, "head_start": {"2026": None}},
        },
        "families": {"family": {"members": ["you", "partner", "child"]}},
        "marital_units": {
            "you": {"members": ["you"]},
            "partner": {"members": ["partner"], "marital_unit_id": {"2026": 1}},
            "child": {"members": ["child"], "marital_unit_id": {"2026": 2}},
        },
        "tax_units": {
            "you": {
                "members": ["you", "child"],
                "tax_unit_id": {"2026": 0},
                "eitc": {"2026": None},
            },
            "partner": {
                "members": ["partner"],
                "tax_unit_id": {"2026": 1},
                "eitc": {"2026": None},
            },
        },
        "spm_units": {
            "spm": {"members": ["you", "partner", "child"], "snap": {"2026": None}}
        },
        "households": {
            "household": {
                "members": ["you", "partner", "child"],
                "state_name": {"2026": "CA"},
                "household_net_income": {"2026": None},
            }
        },
    }


def test_real_model_scalar_and_monthly_annual_sum(household):
    response = calculate_household(household)
    result = response["result"]
    assert response["model_version"] == MODEL_VERSION
    assert result["people"]["you"]["ssi"]["2026"] > 0
    direct = Simulation(tax_benefit_system=get_system(), situation=household)
    annual_ssi = direct.calculate_add("ssi", "2026")[0]
    assert result["people"]["you"]["ssi"]["2026"] == pytest.approx(annual_ssi)
    assert (
        result["tax_units"]["you"]["eitc"]["2026"]
        != result["tax_units"]["partner"]["eitc"]["2026"]
    )
    assert household["people"]["you"]["ssi"]["2026"] is None


def test_income_grid_preserves_both_tax_units_and_axis_order(household):
    grid = deepcopy(household)
    grid["axes"] = [
        [
            {
                "name": "employment_income",
                "count": 2,
                "min": 0,
                "max": 15000,
                "index": 0,
                "period": "2026",
            }
        ],
        [
            {
                "name": "employment_income",
                "count": 2,
                "min": 0,
                "max": 10000,
                "index": 1,
                "period": "2026",
            }
        ],
    ]
    result = calculate_household(grid)["result"]
    for index, (head_income, partner_income) in enumerate(
        [(0, 0), (15000, 0), (0, 10000), (15000, 10000)]
    ):
        point = deepcopy(household)
        point["people"]["you"]["employment_income"]["2026"] = head_income
        point["people"]["partner"]["employment_income"]["2026"] = partner_income
        scalar = calculate_household(point)["result"]
        for entity in ["you", "partner"]:
            assert result["tax_units"][entity]["eitc"]["2026"][index] == pytest.approx(
                scalar["tax_units"][entity]["eitc"]["2026"], abs=0.05
            )
        assert result["households"]["household"]["household_net_income"]["2026"][
            index
        ] == pytest.approx(
            scalar["households"]["household"]["household_net_income"]["2026"], abs=0.05
        )


def test_head_start_option_changes_accounting_not_program_value(household):
    without = calculate_household(household)["result"]
    with_hs = calculate_household(household, True)["result"]
    value = with_hs["people"]["child"]["head_start"]["2026"]
    assert value > 0
    assert value == without["people"]["child"]["head_start"]["2026"]
    assert with_hs["households"]["household"]["household_net_income"]["2026"] - without[
        "households"
    ]["household"]["household_net_income"]["2026"] == pytest.approx(value, abs=0.05)


def test_monthly_enum_input_dispatch(household):
    system = get_system()
    names = [
        name
        for name, variable in system.variables.items()
        if variable.definition_period == "month"
        and variable.value_type.__name__ == "Enum"
        and "provider" in name
    ]
    assert names
    name = names[0]
    variable = system.variables[name]
    choice = list(variable.possible_values)[-1].name
    plural = variable.entity.plural
    entity_id = next(iter(household[plural]))
    household[plural][entity_id][name] = {"2026": choice}
    direct = Simulation(tax_benefit_system=system, situation=household)
    for month in ["2026-01", "2026-12"]:
        assert direct.calculate(name, month).decode()[0].name == choice


@pytest.mark.parametrize(
    "mutation",
    [
        lambda h: h["people"]["you"].update({"not_a_variable": {"2026": None}}),
        lambda h: h["people"]["you"].update({"snap": {"2026": None}}),
        lambda h: h["people"]["you"]["age"].update({"2050": 40}),
        lambda h: h.update(
            {
                "axes": [
                    [
                        {
                            "name": "employment_income",
                            "count": 34,
                            "index": 0,
                            "min": 0,
                            "max": 1,
                            "period": "2026",
                        }
                    ]
                ]
            }
        ),
        lambda h: h["people"]["you"]["employment_income"].update(
            {"2026": float("nan")}
        ),
    ],
)
def test_invalid_requests_fail_explicitly(household, mutation):
    mutation(household)
    with pytest.raises(InvalidHousehold):
        calculate_household(household)


def test_metadata_matches_runtime_and_aggregate_dependencies():
    metadata = build_metadata()["result"]
    assert metadata["model_version"] == MODEL_VERSION
    assert metadata["variables"]["early_head_start"]["entity"] == "person"
    assert (
        metadata["variables"]["child_care_subsidies"]["adds"] in metadata["parameters"]
    )
    assert "gov.household.household_benefits" in metadata["parameters"]
    json.dumps(build_metadata(full=True), allow_nan=False)


def test_calculation_errors_are_not_silently_zeroed(household):
    client = TestClient(web_app)
    get_system(False)
    with patch("backend.simulation.Simulation") as mock_simulation:
        mock_simulation.return_value.calculate.side_effect = RuntimeError(
            "model failure"
        )
        response = client.post("/us/calculate", json={"household": household})
    assert response.status_code == 500
    assert response.json()["status"] == "error"
    assert response.json()["message"].startswith("Could not calculate ")
    assert response.json()["message"].endswith(" for 2026.")
    assert "result" not in response.json()


def test_http_contract_and_size_limit(household):
    client = TestClient(web_app)
    assert client.get("/health").json()["model_version"] == MODEL_VERSION
    response = client.post("/us/calculate", json={"household": household})
    assert response.status_code == 200
    assert response.json()["result"]["spm_units"]["spm"]["snap"]["2026"] > 0
    assert (
        client.post(
            "/us/calculate", json={"household": household, "reform": {}}
        ).status_code
        == 422
    )
    assert (
        client.post("/us/calculate", content=b" " * (MAX_PAYLOAD_BYTES + 1)).status_code
        == 413
    )
