"""UK v1 model adapter with the calculator's existing rent accounting.

The public PolicyEngine API still performs UK policy calculations. Only the
calculator's household-cost reconciliation moves here from the browser.
"""

import json
import math
import re
from copy import deepcopy

import httpx

from backend.simulation import (
    MAX_AMOUNT,
    MAX_AXIS_COUNT,
    MAX_INPUTS,
    MAX_OUTPUTS,
    MAX_PAYLOAD_BYTES,
    MAX_PEOPLE,
    CalculationError,
    InvalidHousehold,
    _year,
)

UK_API_URL = "https://api.policyengine.org/uk/calculate"
RENTED_TENURES = {"RENT_PRIVATELY", "RENT_FROM_COUNCIL", "RENT_FROM_HA"}


def validate_uk_household(household):
    if not isinstance(household, dict):
        raise InvalidHousehold("household must be an object.")
    try:
        size = len(json.dumps(household, allow_nan=False).encode())
    except (TypeError, ValueError) as error:
        raise InvalidHousehold("Inputs must be finite JSON values.") from error
    if size > MAX_PAYLOAD_BYTES:
        raise InvalidHousehold("Household exceeds the request size limit.")
    if set(household) - {"people", "benunits", "households", "axes"}:
        raise InvalidHousehold("Unknown entity collection.")
    people = household.get("people")
    if not isinstance(people, dict) or not 1 <= len(people) <= MAX_PEOPLE:
        raise InvalidHousehold(f"Provide between 1 and {MAX_PEOPLE} people.")
    requested, years, inputs = [], set(), 0
    for plural in ("people", "benunits", "households"):
        group = household.get(plural)
        if not isinstance(group, dict) or not 1 <= len(group) <= len(people):
            raise InvalidHousehold(f"Invalid {plural} collection.")
        if plural == "households" and len(group) != 1:
            raise InvalidHousehold("Provide exactly one household per request.")
        for name, values in group.items():
            if not isinstance(name, str) or not 1 <= len(name) <= 120:
                raise InvalidHousehold("Entity identifiers must be short strings.")
            if not isinstance(values, dict):
                raise InvalidHousehold("Entity inputs must be objects.")
            for variable, periods in values.items():
                if variable == "members" and plural != "people":
                    if not isinstance(periods, list) or len(periods) > len(people):
                        raise InvalidHousehold("Invalid entity membership.")
                    if any(not isinstance(p, str) or p not in people for p in periods):
                        raise InvalidHousehold("Unknown person in entity membership.")
                    continue
                if not re.fullmatch(r"[a-z][a-z0-9_]{0,119}", variable):
                    raise InvalidHousehold("Invalid variable name.")
                if not isinstance(periods, dict) or not periods:
                    raise InvalidHousehold("Variables must contain annual values.")
                for period, value in periods.items():
                    years.add(_year(period))
                    if value is None:
                        requested.append((plural, name, variable, str(period)))
                    else:
                        inputs += 1
                        if isinstance(value, (int, float)):
                            if not math.isfinite(value) or abs(value) > MAX_AMOUNT:
                                raise InvalidHousehold("Input is outside the range.")
                        elif not isinstance(value, str) or len(value) > 200:
                            raise InvalidHousehold("Inputs must be scalar values.")
    if len(years) != 1 or not requested:
        raise InvalidHousehold("Request outputs for one calculation year.")
    if len(requested) > MAX_OUTPUTS or inputs > MAX_INPUTS:
        raise InvalidHousehold("Too many inputs or outputs.")
    year = next(iter(years))
    count = 1
    axes = household.get("axes", [])
    if not isinstance(axes, list) or len(axes) > 2:
        raise InvalidHousehold("At most two income axes are supported.")
    for group in axes:
        if not isinstance(group, list) or len(group) != 1:
            raise InvalidHousehold("Each axis must be a single dimension.")
        axis = group[0]
        if not isinstance(axis, dict) or axis.get("name") != "employment_income":
            raise InvalidHousehold("Only employment_income axes are supported.")
        if set(axis) - {"name", "count", "index", "min", "max", "period"}:
            raise InvalidHousehold("Unknown income axis option.")
        points, index = axis.get("count"), axis.get("index", 0)
        if type(points) is not int or not 1 <= points <= MAX_AXIS_COUNT:
            raise InvalidHousehold("Invalid number of income axis points.")
        if type(index) is not int or not 0 <= index < len(people):
            raise InvalidHousehold("Unknown income axis person.")
        if _year(axis.get("period")) != year:
            raise InvalidHousehold("Income axes must use the calculation year.")
        low, high = axis.get("min"), axis.get("max")
        if (
            type(low) not in (int, float)
            or type(high) not in (int, float)
            or not math.isfinite(low)
            or not math.isfinite(high)
            or not 0 <= low <= high <= MAX_AMOUNT
        ):
            raise InvalidHousehold("Invalid income axis bounds.")
        count *= points
    return requested, year, count


def reconcile_uk_result(household, result, requested, year, count):
    """Return annual household series; reject partial or malformed responses."""
    series = {}
    for plural, name, variable, period in requested:
        value = result.get(plural, {}).get(name, {}).get(variable, {}).get(period)
        values = value if isinstance(value, list) else [value]
        if len(values) != count or any(
            not isinstance(v, (int, float)) or not math.isfinite(v) for v in values
        ):
            raise CalculationError("The UK service returned incomplete results.")
        total = series.setdefault(variable, [0.0] * count)
        for i, value in enumerate(values):
            total[i] += float(value)
    if "household_net_income" not in series:
        raise CalculationError("The UK service did not return household net income.")
    hh = next(iter(household["households"].values()))
    tenure = hh.get("tenure_type", {}).get(year, "OWNED_OUTRIGHT")
    rent = hh.get("rent", {}).get(year, 0) if tenure in RENTED_TENURES else 0
    if not isinstance(rent, (int, float)) or rent < 0:
        raise InvalidHousehold("Rent must be a nonnegative amount.")
    series["rent_deducted"] = [float(rent)] * count
    series["household_net_income"] = [v - rent for v in series["household_net_income"]]
    series["financial_resources"] = list(series["household_net_income"])
    series["healthcare_service_value"] = [0.0] * count
    series["early_education_service_value"] = [0.0] * count
    series["combined_resources"] = list(series["financial_resources"])
    return {
        "version": 1,
        "year": year,
        "axis_order": "first_axis_fastest",
        "series": series,
    }


def calculate_uk_household(household, accounting_version=None):
    if accounting_version is not None and (
        type(accounting_version) is not int or accounting_version != 1
    ):
        raise InvalidHousehold("Unsupported accounting version.")
    requested, year, count = validate_uk_household(household)
    situation = deepcopy(household)
    if accounting_version == 1 and not any(
        v == "household_net_income" for _, _, v, _ in requested
    ):
        name = next(iter(situation["households"]))
        situation["households"][name]["household_net_income"] = {year: None}
        requested.append(("households", name, "household_net_income", year))
    try:
        response = httpx.post(
            UK_API_URL,
            json={"household": situation},
            timeout=110,
            follow_redirects=False,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise CalculationError(
            "The UK calculation service is unavailable. Try again."
        ) from error
    if not isinstance(data, dict) or data.get("status") == "error":
        raise CalculationError(
            "The UK calculation service could not complete the request."
        )
    result = data.get("result", data)
    if not isinstance(result, dict):
        raise CalculationError("The UK service returned incomplete results.")
    output = {"status": "ok", "result": result}
    if accounting_version == 1:
        output["accounting"] = reconcile_uk_result(
            situation, result, requested, year, count
        )
    return output
