"""
Generate test fixtures from policyengine-us (local Python package).

Runs the same scenarios as our JS tests but using the Python engine directly,
providing an independent ground truth for cross-validation.

Usage:  python3 scripts/generate-fixtures.py
Output: tests/fixtures.json
"""

import json
import os
from policyengine_us import Simulation

YEAR = "2026"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
META_PATH = os.path.join(SCRIPT_DIR, "..", "lib", "metadata.json")
OUT_PATH = os.path.join(SCRIPT_DIR, "..", "tests", "fixtures.json")

with open(META_PATH) as f:
    metadata = json.load(f)


def build_situation(state_code, head_income, spouse_income=None,
                    children=None, head_age=40, spouse_age=40):
    """Build a situation dict matching createSituation in api.js."""
    children = children or []
    members = ["you"]

    people = {
        "you": {
            "age": {YEAR: head_age},
            "employment_income": {YEAR: head_income},
        },
    }

    marital_units = {
        "your marital unit": {"members": ["you"]},
    }

    if spouse_income is not None:
        people["your partner"] = {
            "age": {YEAR: spouse_age},
            "employment_income": {YEAR: spouse_income},
        }
        members.append("your partner")
        marital_units["your marital unit"]["members"].append("your partner")

    for i, child in enumerate(children):
        child_id = f"child_{i + 1}"
        people[child_id] = {
            "age": {YEAR: child["age"]},
            "employment_income": {YEAR: 0},
        }
        members.append(child_id)
        marital_units[f"{child_id} marital unit"] = {
            "marital_unit_id": {YEAR: i + 1},
            "members": [child_id],
        }

    return {
        "people": people,
        "families": {"your family": {"members": list(members)}},
        "marital_units": marital_units,
        "tax_units": {"your tax unit": {"members": list(members)}},
        "spm_units": {"your spm_unit": {"members": list(members)}},
        "households": {
            "your household": {
                "members": list(members),
                "state_name": {YEAR: state_code},
            },
        },
    }


def extract_var(sim, variable, entity):
    """Extract a scalar value for a variable, matching our JS entity mapping."""
    val = sim.calculate(variable, YEAR)
    if entity == "person":
        return float(val.sum())
    elif entity == "household":
        return float(val[0])
    elif entity == "tax_unit":
        return float(val[0])
    elif entity == "spm_unit":
        return float(val[0])
    else:
        return float(val[0])


def run_scenario(label, state_code, head_income, spouse_income=None,
                 children=None):
    """Run one scenario and return all extracted values."""
    situation = build_situation(state_code, head_income, spouse_income, children)
    sim = Simulation(situation=situation)

    result = {}

    # Aggregates
    aggregates = {}
    agg_keys = [
        "householdNetIncome",
        "householdNetIncomeWithHealth",
        "householdBenefits",
        "householdRefundableCredits",
        "householdTaxBeforeCredits",
        "healthcareBenefitValue",
        "householdRefundableStateCredits",
    ]
    for i, entry in enumerate(metadata["aggregates"]):
        aggregates[agg_keys[i]] = extract_var(sim, entry["variable"], entry["entity"])
    result["aggregates"] = aggregates

    # Benefits
    result["benefits"] = {}
    for entry in metadata["benefits"]:
        result["benefits"][entry["variable"]] = extract_var(
            sim, entry["variable"], entry["entity"]
        )

    # Credits
    result["credits"] = {}
    for entry in metadata["credits"]:
        result["credits"][entry["variable"]] = extract_var(
            sim, entry["variable"], entry["entity"]
        )

    # Taxes
    result["taxes"] = {}
    for entry in metadata["taxes"]:
        result["taxes"][entry["variable"]] = extract_var(
            sim, entry["variable"], entry["entity"]
        )

    # Healthcare
    result["health"] = {}
    for entry in metadata["healthcare"]:
        result["health"][entry["variable"]] = extract_var(
            sim, entry["variable"], entry["entity"]
        )

    # State credits (aggregate + per-state)
    result["stateCredits"] = {}
    for entry in metadata["stateCredits"]:
        result["stateCredits"][entry["variable"]] = extract_var(
            sim, entry["variable"], entry["entity"]
        )

    # Per-state credit leaf variables
    state_entries = metadata["stateCreditsByState"].get(state_code, [])
    for entry in state_entries:
        result["stateCredits"][entry["label"]] = extract_var(
            sim, entry["variable"], entry["entity"]
        )

    # State taxes
    result["stateTaxes"] = {}
    for entry in metadata["stateTaxes"]:
        result["stateTaxes"][entry["variable"]] = extract_var(
            sim, entry["variable"], entry["entity"]
        )

    return result


# Same scenarios as audit-values.test.js
SCENARIOS = [
    {
        "label": "Married CA $45k/$45k no kids",
        "state": "CA", "head": 45000, "spouse": 45000, "children": [],
    },
    {
        "label": "Single CA $20k 1 child(5)",
        "state": "CA", "head": 20000, "spouse": None, "children": [{"age": 5}],
    },
    {
        "label": "Low-income CA $10k 1 child(3)",
        "state": "CA", "head": 10000, "spouse": None, "children": [{"age": 3}],
    },
    {
        "label": "Married NY $80k/$40k 2 kids",
        "state": "NY", "head": 80000, "spouse": 40000,
        "children": [{"age": 8}, {"age": 12}],
    },
    {
        "label": "Single TX $0 no kids (zero income)",
        "state": "TX", "head": 0, "spouse": None, "children": [],
    },
]


def main():
    fixtures = {}
    for s in SCENARIOS:
        print(f"  Computing: {s['label']}...")
        fixtures[s["label"]] = run_scenario(
            s["label"], s["state"], s["head"], s["spouse"], s["children"],
        )

    # Round to 2 decimal places for stability
    def round_nested(obj):
        if isinstance(obj, dict):
            return {k: round_nested(v) for k, v in obj.items()}
        elif isinstance(obj, float):
            return round(obj, 2)
        return obj

    fixtures = round_nested(fixtures)

    with open(OUT_PATH, "w") as f:
        json.dump(fixtures, f, indent=2)
        f.write("\n")

    print(f"\nWrote {OUT_PATH}")


if __name__ == "__main__":
    main()
