from copy import deepcopy

import httpx
import pytest
from backend.simulation import CalculationError, InvalidHousehold
from backend.uk import calculate_uk_household, validate_uk_household


def household(tenure="RENT_PRIVATELY", rent=12000, axis=False):
    result = {
        "people": {"you": {"age": {"2026": 35}}},
        "benunits": {
            "family": {"members": ["you"], "universal_credit": {"2026": None}}
        },
        "households": {
            "home": {
                "members": ["you"],
                "rent": {"2026": rent},
                "tenure_type": {"2026": tenure},
                "household_net_income": {"2026": None},
            }
        },
    }
    if axis:
        result["axes"] = [
            [
                {
                    "name": "employment_income",
                    "count": 2,
                    "index": 0,
                    "min": 0,
                    "max": 10000,
                    "period": "2026",
                }
            ]
        ]
    return result


def mock_model(monkeypatch, source, net=40000, benefit=5000):
    result = deepcopy(source)
    result["households"]["home"]["household_net_income"]["2026"] = net
    result["benunits"]["family"]["universal_credit"]["2026"] = benefit

    def post(url, **kwargs):
        assert url == "https://api.policyengine.org/uk/calculate"
        assert kwargs["follow_redirects"] is False
        return httpx.Response(
            200,
            json={"status": "ok", "result": result},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", post)


@pytest.mark.parametrize(
    "tenure,expected",
    [
        ("RENT_PRIVATELY", 28000),
        ("RENT_FROM_COUNCIL", 28000),
        ("RENT_FROM_HA", 28000),
        ("OWNED_OUTRIGHT", 40000),
        ("OWNED_WITH_MORTGAGE", 40000),
    ],
)
def test_cost_accounting_deducts_only_renter_costs(monkeypatch, tenure, expected):
    source = household(tenure)
    mock_model(monkeypatch, source)
    response = calculate_uk_household(source, 1)
    series = response["accounting"]["series"]
    assert series["financial_resources"] == [expected]
    assert series["household_net_income"] == [expected]
    assert series["rent_deducted"] == [40000 - expected]
    assert series["universal_credit"] == [5000]
    assert series["combined_resources"] == [expected]
    assert (
        response["result"]["households"]["home"]["household_net_income"]["2026"]
        == 40000
    )
    assert source["households"]["home"]["household_net_income"]["2026"] is None


def test_grid_deducts_same_cost_at_each_point(monkeypatch):
    source = household(axis=True)
    mock_model(monkeypatch, source, net=[20000, 40000], benefit=[5000, 0])
    response = calculate_uk_household(source, 1)
    assert response["accounting"]["axis_order"] == "first_axis_fastest"
    assert response["accounting"]["series"]["financial_resources"] == [8000, 28000]


def test_partial_upstream_results_are_not_silently_zero(monkeypatch):
    source = household(axis=True)
    mock_model(monkeypatch, source, net=[40000], benefit=[5000, 0])
    with pytest.raises(CalculationError, match="incomplete"):
        calculate_uk_household(source, 1)


def test_upstream_failure_is_retryable(monkeypatch):
    def failure(*args, **kwargs):
        raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr(httpx, "post", failure)
    with pytest.raises(CalculationError, match="unavailable"):
        calculate_uk_household(household(), 1)


def test_rejects_unbounded_work_and_unknown_entities():
    source = household(axis=True)
    source["axes"][0][0]["count"] = 100000
    with pytest.raises(InvalidHousehold):
        validate_uk_household(source)
    source = household()
    source["tax_units"] = {}
    with pytest.raises(InvalidHousehold):
        validate_uk_household(source)
    with pytest.raises(InvalidHousehold):
        calculate_uk_household(household(), True)


def test_http_route_uses_the_versioned_accounting(monkeypatch):
    from backend.web import web_app
    from fastapi.testclient import TestClient

    source = household()
    mock_model(monkeypatch, source)
    with TestClient(web_app) as client:
        response = client.post(
            "/uk/calculate", json={"household": source, "accounting_version": 1}
        )
        assert response.status_code == 200
        assert response.json()["accounting"]["series"]["financial_resources"] == [28000]
        assert (
            client.post(
                "/uk/calculate", json={"household": source, "accounting_version": 2}
            ).status_code
            == 422
        )
        assert client.post("/uk/calculate", content="x" * 262145).status_code == 413
