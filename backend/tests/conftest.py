import pytest

PUBLIC_API_SETTING_NAMES = (
    "POLICYENGINE_API_URL",
    "POLICYENGINE_API_AUTH0_DOMAIN",
    "POLICYENGINE_API_AUTH0_AUDIENCE",
    "POLICYENGINE_API_AUTH0_CLIENT_ID",
    "POLICYENGINE_API_AUTH0_CLIENT_SECRET",
)


@pytest.fixture(autouse=True)
def no_public_api_settings(monkeypatch):
    """Keep a developer's own Public API settings out of every test."""
    for setting_name in PUBLIC_API_SETTING_NAMES:
        monkeypatch.delenv(setting_name, raising=False)
