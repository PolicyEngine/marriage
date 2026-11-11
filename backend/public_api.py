"""This backend's own credential for the PolicyEngine Public API.

The UK adapter (backend/uk.py) posts to the Public API's /uk/calculate. On
Modal, the secret "marriage-household-api-policyengine-api" provides the five
POLICYENGINE_API_* settings that backend/public_api_token.py reads: the Public
API's address and this backend's Auth0 client in the Public API's own tenant.
Each request then carries that client's token in Authorization. Containers
share the token through the Modal Dict "marriage-household-api-public-api-token",
so the deployment asks Auth0 for about one token a day, not one per container.

Outside Modal, with none of the five settings (local runs and the manual
"Live UK integration checks" workflow), requests go to
https://api.policyengine.org without a credential, as before; the Public API
serves them until it requires one. Inside a Modal container the settings are
required, and a partial set is refused everywhere, so a broken secret cannot
pass for "no credential".

Settings and tokens are read when a request needs them, never at import or in
the Modal memory-snapshot step, so no token is stored in a snapshot.
"""

from __future__ import annotations

import os
import threading
import time

import httpx

from backend.public_api_token import (
    SETTING_VARIABLES,
    PublicApiSettings,
    PublicApiSettingsError,
    PublicApiTokenProvider,
    SharedTokenStore,
)

PRODUCTION_API_URL = "https://api.policyengine.org"
TOKEN_STORE_NAME = "marriage-household-api-public-api-token"

_token_providers: dict[PublicApiSettings, PublicApiTokenProvider] = {}
_token_providers_lock = threading.Lock()


def public_api_tokens() -> PublicApiTokenProvider | None:
    """Returns the token provider for the configured client, or None without settings.

    One provider exists per set of settings, so one token is cached per client.

    Raises:
        PublicApiSettingsError: only some of the five settings are present,
            or none inside a Modal container.
    """
    if not any(
        os.environ.get(variable_name, "").strip()
        for variable_name in SETTING_VARIABLES.values()
    ):
        if _running_on_modal():
            raise PublicApiSettingsError(
                f"Set {', '.join(SETTING_VARIABLES.values())}."
            )
        return None
    settings = PublicApiSettings.from_environment()
    _check_api_url(settings.api_url)
    with _token_providers_lock:
        provider = _token_providers.get(settings)
        if provider is None:
            # time.time is read here, not bound when the template was imported.
            provider = PublicApiTokenProvider(
                settings, shared_store=_shared_token_store(), clock=time.time
            )
            _token_providers[settings] = provider
        return provider


def _check_api_url(api_url: str) -> None:
    """Refuses an address httpx cannot use, or one that would send the token
    unencrypted."""
    try:
        parsed_url = httpx.URL(api_url)
    except httpx.InvalidURL:
        parsed_url = None
    if parsed_url is None or parsed_url.scheme != "https" or not parsed_url.host:
        raise PublicApiSettingsError("POLICYENGINE_API_URL must be an https URL.")


def _running_on_modal() -> bool:
    import modal

    return not modal.is_local()


def _shared_token_store() -> SharedTokenStore | None:
    """The Modal Dict inside a Modal container; nothing to share elsewhere."""
    if not _running_on_modal():
        return None
    import modal

    return modal.Dict.from_name(TOKEN_STORE_NAME, create_if_missing=True)
