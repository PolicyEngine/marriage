from copy import deepcopy

import pytest
from backend.simulation import InvalidHousehold, calculate_household
from backend.web import web_app
from fastapi.testclient import TestClient


def vermont_household():
    people = {}
    for name, age, income, cost in [
        ("you", 40, 20000, 0),
        ("partner", 40, 15000, 0),
        ("paid", 3, 0, 12000),
        ("unpaid", 3, 0, 0),
        ("older", 17, 0, 12000),
    ]:
        people[name] = {
            "age": {"2026": age},
            "employment_income": {"2026": income},
            "weekly_hours_worked_before_lsr": {"2026": 40 if income else 0},
            "pre_subsidy_childcare_expenses": {"2026": cost},
            "childcare_hours_per_day": {"2026": 8 if cost else 0},
            "childcare_days_per_week": {"2026": 5 if cost else 0},
            "vt_ccfap_provider_type": {"2026": "LICENSED_CENTER"},
            "vt_ccfap_eligible_child": {"2026": None},
            "vt_ccfap_state_rate": {"2026": None},
        }
    members = list(people)
    return {
        "people": people,
        "families": {"family": {"members": members}},
        "marital_units": {
            "parents": {"members": ["you", "partner"]},
            **{
                name: {"members": [name], "marital_unit_id": {"2026": index + 1}}
                for index, name in enumerate(["paid", "unpaid", "older"])
            },
        },
        "tax_units": {"tax": {"members": members}},
        "spm_units": {
            "spm": {
                "members": members,
                "vt_child_care_subsidies": {"2026": None},
                "child_care_subsidies": {"2026": None},
            }
        },
        "households": {"household": {"members": members, "state_name": {"2026": "VT"}}},
    }


def test_only_paid_model_eligible_children_participate_and_no_cross_request_leak():
    household = vermont_household()
    before = calculate_household(household)["result"]
    filtered = calculate_household(household, ccdf_participation_filter=True)["result"]
    after = calculate_household(household)["result"]
    assert before == after
    eligible = {
        name: person["vt_ccfap_eligible_child"]["2026"]
        for name, person in filtered["people"].items()
    }
    assert eligible == {
        "you": False,
        "partner": False,
        "paid": True,
        "unpaid": False,
        "older": False,
    }
    assert filtered["people"]["paid"]["vt_ccfap_state_rate"]["2026"] > 0
    assert filtered["people"]["unpaid"]["vt_ccfap_state_rate"]["2026"] == 0
    assert filtered["people"]["older"]["vt_ccfap_state_rate"]["2026"] == 0
    subsidy = filtered["spm_units"]["spm"]["vt_child_care_subsidies"]["2026"]
    original = before["spm_units"]["spm"]["vt_child_care_subsidies"]["2026"]
    assert subsidy > 0
    assert original > subsidy
    assert subsidy == filtered["spm_units"]["spm"]["child_care_subsidies"]["2026"]
    assert household["people"]["paid"]["vt_ccfap_eligible_child"]["2026"] is None


def test_participation_mask_applies_to_all_months_and_axis_people():
    household = vermont_household()
    household["axes"] = [
        [
            {
                "name": "employment_income",
                "count": 2,
                "min": 20000,
                "max": 40000,
                "index": 0,
                "period": "2026",
            }
        ],
        [
            {
                "name": "employment_income",
                "count": 2,
                "min": 15000,
                "max": 30000,
                "index": 1,
                "period": "2026",
            }
        ],
    ]
    grid = calculate_household(household, ccdf_participation_filter=True)["result"]
    assert grid["people"]["paid"]["vt_ccfap_eligible_child"]["2026"] == [True] * 4
    assert grid["people"]["unpaid"]["vt_ccfap_eligible_child"]["2026"] == [False] * 4
    assert grid["people"]["older"]["vt_ccfap_eligible_child"]["2026"] == [False] * 4
    assert grid["people"]["unpaid"]["vt_ccfap_state_rate"]["2026"] == [0] * 4
    for index, (head, partner) in enumerate(
        [(20000, 15000), (40000, 15000), (20000, 30000), (40000, 30000)]
    ):
        point = deepcopy(household)
        point.pop("axes")
        point["people"]["you"]["employment_income"]["2026"] = head
        point["people"]["partner"]["employment_income"]["2026"] = partner
        scalar = calculate_household(point, ccdf_participation_filter=True)["result"]
        assert grid["spm_units"]["spm"]["vt_child_care_subsidies"]["2026"][
            index
        ] == pytest.approx(
            scalar["spm_units"]["spm"]["vt_child_care_subsidies"]["2026"], abs=0.05
        )


def test_http_filter_option_and_reject_partial_eligibility_override():
    household = vermont_household()
    response = TestClient(web_app).post(
        "/us/calculate",
        json={"household": household, "ccdf_participation_filter": True},
    )
    assert response.status_code == 200
    assert (
        response.json()["result"]["people"]["paid"]["vt_ccfap_eligible_child"]["2026"]
        is True
    )
    household["people"]["unpaid"]["vt_ccfap_eligible_child"]["2026"] = False
    with pytest.raises(InvalidHousehold, match="Do not override"):
        calculate_household(household, ccdf_participation_filter=True)


def test_filter_has_no_effect_outside_vermont():
    household = vermont_household()
    household["households"]["household"]["state_name"]["2026"] = "CA"
    # This deliberate input would be rejected by the Vermont-only filter. A
    # different state's request must not be subjected to Vermont input rules.
    household["people"]["unpaid"]["vt_ccfap_eligible_child"]["2026"] = False
    household["spm_units"]["spm"].pop("child_care_subsidies")
    assert calculate_household(
        household, ccdf_participation_filter=True
    ) == calculate_household(household)
