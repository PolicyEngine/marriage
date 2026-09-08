"""Actual PolicyEngine-US household calculations with the v1 JSON shape.

No population data, approximation formulas, or input logging are used here.
The US model is pinned in pyproject.toml and uv.lock.
"""

import json
import math
import re
from copy import deepcopy
from functools import lru_cache
from importlib.metadata import version

import numpy as np
from policyengine_core.parameters import Parameter
from policyengine_core.reforms import Reform
from policyengine_us import Simulation

MODEL_VERSION = "1.824.1"
MIN_YEAR = 2022
MAX_YEAR = 2035
MAX_PAYLOAD_BYTES = 262_144
MAX_PEOPLE = 12
MAX_OUTPUTS = 512
MAX_INPUTS = 2_048
MAX_AXIS_COUNT = 33
MAX_AMOUNT = 10_000_000


class InvalidHousehold(ValueError):
    """A malformed or oversized household request."""


class CalculationError(RuntimeError):
    """An explicitly requested model calculation failed."""


def _year(value):
    if not re.fullmatch(r"\d{4}", str(value)) or not MIN_YEAR <= int(value) <= MAX_YEAR:
        raise InvalidHousehold(f"Years must be between {MIN_YEAR} and {MAX_YEAR}.")
    return str(value)


def get_system(include_head_start_benefits=False):
    return _get_system(include_head_start_benefits)


@lru_cache(maxsize=2)
def _get_system(include_head_start_benefits):
    actual_version = version("policyengine-us")
    if actual_version != MODEL_VERSION:
        raise RuntimeError(
            f"Expected policyengine-us {MODEL_VERSION}, got {actual_version}."
        )
    system = Simulation.default_tax_benefit_system_instance
    # This is the sole allowed reform. It controls accounting of noncash benefits,
    # not Head Start or Early Head Start eligibility or program amounts.
    reform = Reform.from_dict(
        {
            "gov.simulation.include_head_start_benefits_in_net_income": {
                f"{MIN_YEAR}-01-01.{MAX_YEAR}-12-31": include_head_start_benefits
            }
        },
        country_id="us",
    )
    return reform(system)


def validate_household(household, system):
    """Restrict work before instantiating a simulation; return requested outputs."""
    if not isinstance(household, dict):
        raise InvalidHousehold("household must be an object.")
    try:
        size = len(json.dumps(household, allow_nan=False).encode())
    except (TypeError, ValueError) as error:
        raise InvalidHousehold("Inputs must be finite JSON values.") from error
    if size > MAX_PAYLOAD_BYTES:
        raise InvalidHousehold("Household exceeds the request size limit.")

    entities = {entity.plural: entity for entity in system.entities}
    if set(household) - set(entities) - {"axes"}:
        raise InvalidHousehold("Unknown entity collection.")
    people = household.get("people")
    if not isinstance(people, dict) or not 1 <= len(people) <= MAX_PEOPLE:
        raise InvalidHousehold(f"Provide between 1 and {MAX_PEOPLE} people.")
    if len(household.get("households", {})) != 1:
        raise InvalidHousehold("Provide exactly one household per request.")
    requested = []
    inputs = 0
    years = set()
    for plural, entity in entities.items():
        group = household.get(plural)
        if not isinstance(group, dict) or not 1 <= len(group) <= len(people):
            raise InvalidHousehold(f"Invalid {plural} collection.")
        role_keys = set()
        for role in getattr(entity, "roles", []):
            role_keys.add(role.key)
            if role.plural:
                role_keys.add(role.plural)
        for entity_id, values in group.items():
            if not isinstance(entity_id, str) or not 1 <= len(entity_id) <= 120:
                raise InvalidHousehold("Entity identifiers must be short strings.")
            if not isinstance(values, dict):
                raise InvalidHousehold("Entity inputs must be objects.")
            for name, periods in values.items():
                if name in role_keys:
                    members = periods if isinstance(periods, list) else [periods]
                    if len(members) > len(people) or any(
                        m not in people for m in members
                    ):
                        raise InvalidHousehold(
                            "Entity membership names unknown people."
                        )
                    continue
                variable = system.variables.get(name)
                if variable is None or variable.entity.plural != plural:
                    raise InvalidHousehold(f"Unknown or misplaced variable: {name}.")
                if not isinstance(periods, dict) or not periods:
                    raise InvalidHousehold(f"{name} must contain annual values.")
                for period, value in periods.items():
                    years.add(_year(period))
                    if value is None:
                        requested.append((plural, entity_id, name, str(period)))
                    else:
                        inputs += 1
                        if isinstance(value, (int, float)):
                            if not math.isfinite(value) or abs(value) > MAX_AMOUNT:
                                raise InvalidHousehold(
                                    f"{name} is outside the input range."
                                )
                        elif not isinstance(value, str) or len(value) > 200:
                            raise InvalidHousehold(f"{name} must be a scalar input.")
    if len(years) != 1:
        raise InvalidHousehold("Use one calculation year per request.")
    if not requested or len(requested) > MAX_OUTPUTS or inputs > MAX_INPUTS:
        raise InvalidHousehold("Invalid number of requested outputs or inputs.")

    axes = household.get("axes")
    if axes is not None:
        if not isinstance(axes, list) or not 1 <= len(axes) <= 2:
            raise InvalidHousehold("At most two income axes are supported.")
        for group in axes:
            if not isinstance(group, list) or len(group) != 1:
                raise InvalidHousehold("Each income axis must be a single dimension.")
            axis = group[0]
            if not isinstance(axis, dict) or axis.get("name") != "employment_income":
                raise InvalidHousehold("Only employment_income axes are supported.")
            if set(axis) - {"name", "count", "index", "min", "max", "period"}:
                raise InvalidHousehold("Unknown income axis option.")
            count = axis.get("count")
            index = axis.get("index", 0)
            if type(count) is not int or not 1 <= count <= MAX_AXIS_COUNT:
                raise InvalidHousehold(
                    f"Income axes support at most {MAX_AXIS_COUNT} points."
                )
            if type(index) is not int or not 0 <= index < len(people):
                raise InvalidHousehold("Income axis refers to an unknown person.")
            if _year(axis.get("period")) not in years:
                raise InvalidHousehold("Income axes must use the calculation year.")
            low, high = axis.get("min"), axis.get("max")
            if (
                type(low) not in (int, float)
                or type(high) not in (int, float)
                or not math.isfinite(low)
                or not math.isfinite(high)
                or not 0 <= low <= high <= MAX_AMOUNT
            ):
                raise InvalidHousehold("Income axis bounds are invalid.")
    return requested


def _serialize_values(values, variable):
    if variable.value_type.__name__ == "Enum":
        return [item.name for item in values.decode()]
    if variable.value_type is float:
        result = [float(str(value)) for value in values]
        if not all(math.isfinite(value) for value in result):
            raise CalculationError("Model returned a nonfinite result.")
        return result
    return values.tolist()


def _filter_vermont_participation(simulation, household, year):
    """Restrict the model's Vermont eligible-child set to entered paid care.

    Compute complete vectors, including every replicated axis person. Partial
    person inputs would incorrectly replace other children's eligibility with
    the variable's false default. All eligibility tests remain model-computed.
    """
    if not (simulation.calculate("state_code_str", year) == "VT").any():
        return
    for person in household["people"].values():
        if any(
            value is not None
            for value in person.get("vt_ccfap_eligible_child", {}).values()
        ):
            raise InvalidHousehold(
                "Do not override Vermont child eligibility when filtering participation."
            )
    masks = {}
    for month in range(1, 13):
        period = f"{year}-{month:02}"
        eligible = simulation.calculate("vt_ccfap_eligible_child", period)
        paid_care = simulation.calculate("pre_subsidy_childcare_expenses", period) > 0
        masks[period] = eligible & paid_care
    for period, mask in masks.items():
        simulation.set_input("vt_ccfap_eligible_child", period, mask)
    # The pinned core preserves explicit inputs, including our full monthly
    # vectors, while purging all dependent formula outputs computed above.
    simulation._invalidate_all_caches()
    _apply_vermont_family_share(simulation, year)


def _apply_vermont_family_share(simulation, year):
    """Carry collected family shares into actual childcare expense deductions.

    Vermont pays the provider its state rate even above the provider's price;
    that does not waive the family's collectible share. This app assumes the
    provider collects that share. See the below-state-rate example on page 2:
    https://outside.vermont.gov/dept/DCF/Shared%20Documents/CDD/CCFAP/CCFAP-Understanding-Payments.pdf
    """
    # Respect the app's explicit zero on this final state aggregate when no
    # funded place is available; its underlying vt_ccfap formula can still be
    # positive. Family-share policy and period conversion remain model-owned.
    has_funding = simulation.calculate("vt_child_care_subsidies", year) > 0
    annual_expenses = np.zeros_like(has_funding, dtype=float)
    for month in range(1, 13):
        period = f"{year}-{month:02}"
        gross = simulation.calculate(
            "pre_subsidy_childcare_expenses", period, map_to="spm_unit"
        )
        payment = np.where(has_funding, simulation.calculate("vt_ccfap", period), 0)
        family_share = simulation.calculate("vt_ccfap_family_share", period)
        annual_expenses += np.maximum(
            np.maximum(gross - payment, 0),
            np.where((payment > 0) & (gross > 0), family_share, 0),
        )
    # childcare_expenses is YEAR-defined. Sum the twelve model-period amounts
    # before setting its complete SPM vector, including replicated axis units.
    # SNAP and the tax-unit CDCC expense allocation then consume the same cost.
    simulation.set_input("childcare_expenses", year, annual_expenses)
    simulation._invalidate_all_caches()


def calculate_household(
    household,
    include_head_start_benefits=False,
    ccdf_participation_filter=False,
    accounting_version=None,
):
    if type(include_head_start_benefits) is not bool:
        raise InvalidHousehold("include_head_start_benefits must be a boolean.")
    if type(ccdf_participation_filter) is not bool:
        raise InvalidHousehold("ccdf_participation_filter must be a boolean.")
    if accounting_version is not None and (
        type(accounting_version) is not int or accounting_version != 1
    ):
        raise InvalidHousehold("Only accounting_version 1 is supported.")
    # New accounting reports service values independently of presentation
    # choices. Legacy requests retain the original opt-in inclusion behavior.
    system = get_system(
        False if accounting_version == 1 else include_head_start_benefits
    )
    requested = validate_household(household, system)
    result = deepcopy(household)
    try:
        simulation = Simulation(tax_benefit_system=system, situation=household)
    except Exception as error:
        raise InvalidHousehold(
            "The model could not initialize this household."
        ) from error
    if ccdf_participation_filter:
        try:
            _filter_vermont_participation(simulation, household, requested[0][3])
        except InvalidHousehold:
            raise
        except Exception as error:
            raise CalculationError(
                "Could not determine childcare participation."
            ) from error

    # Calculate each variable once, then select each original entity across copies
    # produced by axes. PolicyEngine's first axis varies fastest, as in v1.
    calculated = {}
    for plural, entity_id, name, period in requested:
        key = (name, period)
        if key not in calculated:
            try:
                calculated[key] = _serialize_values(
                    simulation.calculate(name, period), system.variables[name]
                )
            except Exception as error:
                raise CalculationError(
                    f"Could not calculate {name} for {period}."
                ) from error
        values = calculated[key]
        if "axes" in household:
            entity_count = len(household[plural])
            index = list(household[plural]).index(entity_id)
            entity_result = values[index::entity_count]
        else:
            index = simulation.get_population(plural).get_index(entity_id)
            entity_result = values[index]
        result[plural][entity_id][name][period] = entity_result
    response = {"status": "ok", "result": result, "model_version": MODEL_VERSION}
    if accounting_version == 1:
        from backend.accounting import build_accounting

        try:
            response["accounting"] = build_accounting(
                simulation, requested, requested[0][3], MODEL_VERSION
            )
        except Exception as error:
            raise CalculationError(
                "Could not reconcile household resources."
            ) from error
    return response


@lru_cache(maxsize=2)
def build_metadata(full=False):
    """Return model-matched metadata; compact still includes all variable names."""
    system = get_system()
    variables = {}
    for name, variable in system.variables.items():
        entry = {
            "name": name,
            "entity": variable.entity.key,
            "label": variable.label,
            "valueType": variable.value_type.__name__,
            "definitionPeriod": str(variable.definition_period),
            "adds": variable.adds,
            "subtracts": variable.subtracts,
            "isInputVariable": variable.is_input_variable(),
        }
        if variable.value_type.__name__ == "Enum":
            entry["possibleValues"] = [
                {"value": value.name, "label": value.value}
                for value in variable.possible_values
            ]
            entry["defaultValue"] = variable.default_value.name
        elif isinstance(variable.default_value, (int, float, bool, str)):
            entry["defaultValue"] = variable.default_value
        if full:
            entry.update(
                documentation=variable.documentation,
                unit=variable.unit,
                moduleName=variable.module_name,
            )
        variables[name] = entry
    # The frontend discovers aggregate children through parameter-backed `adds`.
    referenced = {
        item
        for variable in system.variables.values()
        for item in (variable.adds, variable.subtracts)
        if isinstance(item, str)
    }
    parameters = {}
    for parameter in system.parameters.get_descendants():
        if isinstance(parameter, Parameter) and (
            full
            or parameter.name in referenced
            or parameter.name.startswith("gov.household.")
            or parameter.name
            == "gov.simulation.include_head_start_benefits_in_net_income"
        ):
            parameters[parameter.name] = {
                "values": {
                    item.instant_str: _metadata_value(item.value)
                    for item in parameter.values_list
                }
            }
    return {
        "status": "ok",
        "result": {
            "variables": variables,
            "parameters": parameters,
            "model_version": MODEL_VERSION,
        },
    }


def _metadata_value(value):
    # Match the public API's representation of open-ended policy thresholds.
    if isinstance(value, float) and not math.isfinite(value):
        return "Infinity" if value > 0 else "-Infinity" if value < 0 else "NaN"
    if isinstance(value, dict):
        return {str(key): _metadata_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_metadata_value(item) for item in value]
    return value


if __name__ == "__main__":
    import argparse
    from pathlib import Path

    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    args.metadata.write_text(json.dumps(build_metadata(args.full), allow_nan=False))
