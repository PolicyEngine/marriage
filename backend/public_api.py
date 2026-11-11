"""This backend's own credential for the PolicyEngine Public API.

The UK adapter (backend/uk.py) posts to the Public API's /uk/calculate. On
Modal, the secret "marriage-household-api-policyengine-api" provides the five
POLICYENGINE_API_* settings that backend/public_api_token.py reads: the Public
API's address and this backend's Auth0 client in the Public API's own tenant.
Each request then carries that client's token in Authorization. Containers
share the token through the Modal Dict "marriage-household-api-public-api-token",
so the deployment asks Auth0 for about one token a day, not one per container.

With none of the five settings (local runs and the manual "Live UK integration
checks" workflow), requests go to https://api.policyengine.org without a
credential, as before; the Public API serves them until it requires one. A
partial set is refused, so a broken secret cannot pass for "no credential".

Settings and tokens are read when a request needs them, never at import or in
the Modal memory-snapshot step, so no token is stored in a snapshot.
"""

from __future__ import annotations

import os
import threading
import time

from backend.public_api_token import (
    SETTING_VARIABLES,
    PublicApiSettings,
    PublicApiTokenProvider,
)

PRODUCTION_API_URL = "https://api.policyengine.org"
TOKEN_STORE_NAME = "marriage-household-api-public-api-token"

_token_providers: dict[PublicApiSettings, PublicApiTokenProvider] = {}
_token_providers_lock = threading.Lock()


def public_api_tokens() -> PublicApiTokenProvider | None:
    """Returns the token provider for the configured client, or None without settings.

    One provider exists per set of settings, so one token is cached per client.

    Raises:
        PublicApiSettingsError: only some of the five settings are present.
    """
    if not any(
        os.environ.get(variable_name, "").strip()
        for variable_name in SETTING_VARIABLES.values()
    ):
        return None
    settings = PublicApiSettings.from_environment()
    with _token_providers_lock:
        provider = _token_providers.get(settings)
        if provider is None:
            # time.time is read here, not bound when the template was imported.
            provider = PublicApiTokenProvider(
                settings, shared_store=_shared_token_store(), clock=time.time
            )
            _token_providers[settings] = provider
        return provider


def _shared_token_store():
    """The Modal Dict inside a Modal container; nothing to share elsewhere."""
    import modal

    if modal.is_local():
        return None
    return modal.Dict.from_name(TOKEN_STORE_NAME, create_if_missing=True)
