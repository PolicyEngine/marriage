import pytest
from backend.public_api_token import SETTING_VARIABLES


@pytest.fixture(autouse=True)
def no_public_api_settings(monkeypatch):
    """Keep a developer's own Public API settings out of every test."""
    for setting_name in SETTING_VARIABLES.values():
        monkeypatch.delenv(setting_name, raising=False)
