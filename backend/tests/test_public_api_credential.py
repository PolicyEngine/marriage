"""The UK adapter's own Public API credential.

The UK adapter posts to the Public API's /uk/calculate. With the five
POLICYENGINE_API_* settings present, as the Modal secret provides them, every
request carries this backend's Auth0 client-credentials token. These tests
replace Auth0, the Public API and Modal's shared Dict with in-process fakes.
"""

import http.client
import importlib.util
import io
import json
import logging
import time
import urllib.error
import urllib.request
import urllib.response
import uuid
from copy import deepcopy
from pathlib import Path

import httpx
import modal
import pytest
from backend.public_api_token import SETTING_VARIABLES
from backend.simulation import CalculationError
from backend.uk import calculate_uk_household

CLIENT_SECRET = "client-secret-that-must-stay-private"
TOKEN_ENDPOINT_HOST = "policyengine-api.uk.auth0.com"
AUDIENCE = "https://api.policyengine.org/"
CONFIGURED_API_URL = "https://public-api.example.test"
TOKEN_LIFETIME_SECONDS = 86400
REFRESH_MARGIN_SECONDS = 300
UNAVAILABLE_MESSAGE = "The UK calculation service is unavailable. Try again."
BACKEND_DIRECTORY = Path(__file__).resolve().parents[1]


def authorization(public_api_call):
    return (public_api_call.get("headers") or {}).get("Authorization")


def uk_household():
    return {
        "people": {"you": {"age": {"2026": 35}}},
        "benunits": {
            "family": {"members": ["you"], "universal_credit": {"2026": None}}
        },
        "households": {
            "home": {
                "members": ["you"],
                "tenure_type": {"2026": "OWNED_OUTRIGHT"},
                "household_net_income": {"2026": None},
            }
        },
    }


class FakeClock:
    def __init__(self):
        self.wall_seconds = 1_800_000_000.0
        self.monotonic_seconds = 1000.0


class AnswerThatBreaksOff(io.BytesIO):
    """An answer body whose reading fails, as when a connection drops mid-answer."""

    def __init__(self, failure):
        super().__init__()
        self.failure = failure

    def read(self, *arguments):
        raise self.failure


class FakeAuth0:
    """Answers HTTPS requests beneath urllib's real opener.

    Only the HTTPS handler is replaced, so the token provider's own opener,
    with its redirect refusal and urllib's error handling, stays in the path.
    """

    def __init__(self, clock):
        self.clock = clock
        self.token_requests = []
        self.status_code = 200
        self.answer_headers = {}
        self.answer_body = None
        self.failure_before_answer = None
        self.failure_while_reading = None
        self.seconds_per_request = 0.0
        self.lifetime_seconds = TOKEN_LIFETIME_SECONDS

    def https_open(self, request):
        self.token_requests.append(
            {
                "url": request.full_url,
                "method": request.get_method(),
                "body": json.loads(request.data),
                "timeout": request.timeout,
            }
        )
        self.clock.monotonic_seconds += self.seconds_per_request
        if self.failure_before_answer is not None:
            raise self.failure_before_answer
        if self.failure_while_reading is not None:
            body_stream = AnswerThatBreaksOff(self.failure_while_reading)
        else:
            body = self.answer_body or {
                "access_token": f"token-{len(self.token_requests)}",
                "expires_in": self.lifetime_seconds,
                "token_type": "Bearer",
            }
            body_stream = io.BytesIO(json.dumps(body).encode())
        headers = http.client.HTTPMessage()
        for header_name, header_value in self.answer_headers.items():
            headers[header_name] = header_value
        answer = urllib.response.addinfourl(
            body_stream, headers, request.full_url, self.status_code
        )
        answer.msg = http.client.responses[self.status_code]
        return answer


class FakePublicApi:
    """Stands in for httpx.post, which the UK adapter uses for the Public API."""

    def __init__(self):
        self.calls = []
        self.status_code = 200

    def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        result = deepcopy(kwargs["json"]["household"])
        result["households"]["home"]["household_net_income"]["2026"] = 40000
        result["benunits"]["family"]["universal_credit"]["2026"] = 0
        if self.status_code == 401:
            return httpx.Response(
                401,
                json={"status": "error", "message": "Authentication is required"},
                headers={"WWW-Authenticate": "Bearer"},
                request=httpx.Request("POST", url),
            )
        return httpx.Response(
            self.status_code,
            json={"status": "ok", "message": None, "result": result},
            request=httpx.Request("POST", url),
        )


@pytest.fixture
def clock(monkeypatch):
    """Replaces time.time, which the token provider uses for expiry."""
    fake_clock = FakeClock()
    monkeypatch.setattr(time, "time", lambda: fake_clock.wall_seconds)
    return fake_clock


@pytest.fixture
def auth0(monkeypatch, clock):
    fake_auth0 = FakeAuth0(clock)
    monkeypatch.setattr(
        urllib.request.HTTPSHandler, "https_open", fake_auth0.https_open
    )
    return fake_auth0


@pytest.fixture
def public_api(monkeypatch):
    fake_public_api = FakePublicApi()
    monkeypatch.setattr(httpx, "post", fake_public_api.post)
    return fake_public_api


@pytest.fixture
def credential_settings(monkeypatch):
    """The five settings, with a client ID of this test's own."""
    settings = {
        "POLICYENGINE_API_URL": f"{CONFIGURED_API_URL}/",
        "POLICYENGINE_API_AUTH0_DOMAIN": TOKEN_ENDPOINT_HOST,
        "POLICYENGINE_API_AUTH0_AUDIENCE": AUDIENCE,
        "POLICYENGINE_API_AUTH0_CLIENT_ID": f"client-{uuid.uuid4().hex}",
        "POLICYENGINE_API_AUTH0_CLIENT_SECRET": CLIENT_SECRET,
    }
    for setting_name, value in settings.items():
        monkeypatch.setenv(setting_name, value)
    return settings


@pytest.fixture
def shared_token_store(monkeypatch):
    """Runs as if inside a Modal container, with a plain dict as the shared Dict."""
    stored_tokens = {}
    requested_stores = []

    def dict_from_name(name, **options):
        requested_stores.append((name, options))
        return stored_tokens

    monkeypatch.setattr(modal, "is_local", lambda: False)
    monkeypatch.setattr(modal.Dict, "from_name", staticmethod(dict_from_name))
    return stored_tokens, requested_stores


def test_uk_calculation_sends_this_backends_token(
    credential_settings, auth0, public_api
):
    calculate_uk_household(uk_household(), 1)

    assert auth0.token_requests == [
        {
            "url": f"https://{TOKEN_ENDPOINT_HOST}/oauth/token",
            "method": "POST",
            "body": {
                "grant_type": "client_credentials",
                "client_id": credential_settings["POLICYENGINE_API_AUTH0_CLIENT_ID"],
                "client_secret": CLIENT_SECRET,
                "audience": AUDIENCE,
            },
            "timeout": 10,
        }
    ]
    [public_api_call] = public_api.calls
    assert public_api_call["url"] == f"{CONFIGURED_API_URL}/uk/calculate"
    assert authorization(public_api_call) == "Bearer token-1"
    assert public_api_call["follow_redirects"] is False
    assert public_api_call["timeout"] == pytest.approx(110, abs=1)


def test_one_token_serves_many_calculations(credential_settings, auth0, public_api):
    for _ in range(3):
        calculate_uk_household(uk_household(), 1)

    assert len(auth0.token_requests) == 1
    assert [authorization(call) for call in public_api.calls] == ["Bearer token-1"] * 3


def test_token_is_replaced_five_minutes_before_it_expires(
    credential_settings, auth0, public_api, clock
):
    calculate_uk_household(uk_household(), 1)
    clock.wall_seconds += TOKEN_LIFETIME_SECONDS - REFRESH_MARGIN_SECONDS - 1
    calculate_uk_household(uk_household(), 1)
    clock.wall_seconds += 1
    calculate_uk_household(uk_household(), 1)

    assert len(auth0.token_requests) == 2
    assert [authorization(call) for call in public_api.calls] == [
        "Bearer token-1",
        "Bearer token-1",
        "Bearer token-2",
    ]


def test_containers_store_the_token_in_the_shared_modal_dict(
    credential_settings, auth0, public_api, shared_token_store
):
    stored_tokens, requested_stores = shared_token_store

    calculate_uk_household(uk_household(), 1)

    assert requested_stores == [
        ("marriage-household-api-public-api-token", {"create_if_missing": True})
    ]
    [stored_token] = stored_tokens.values()
    assert stored_token["access_token"] == "token-1"
    assert CLIENT_SECRET not in json.dumps(stored_tokens)


def test_a_token_another_container_stored_is_used_without_asking_auth0(
    credential_settings, auth0, public_api, shared_token_store, clock
):
    stored_tokens, _ = shared_token_store
    client_id = credential_settings["POLICYENGINE_API_AUTH0_CLIENT_ID"]
    stored_tokens[f"public-api-token {TOKEN_ENDPOINT_HOST} {AUDIENCE} {client_id}"] = {
        "access_token": "token-from-another-container",
        "refresh_at": clock.wall_seconds + 3600,
    }

    calculate_uk_household(uk_household(), 1)

    assert auth0.token_requests == []
    [public_api_call] = public_api.calls
    assert authorization(public_api_call) == "Bearer token-from-another-container"


def test_public_api_401_is_reported_without_requesting_another_token(
    credential_settings, auth0, public_api, caplog
):
    public_api.status_code = 401

    with caplog.at_level(logging.INFO):
        for _ in range(2):
            with pytest.raises(CalculationError):
                calculate_uk_household(uk_household(), 1)

    assert len(auth0.token_requests) == 1
    assert len(public_api.calls) == 2
    assert credential_settings["POLICYENGINE_API_AUTH0_CLIENT_ID"] in caplog.text
    assert "401" in caplog.text
    assert CLIENT_SECRET not in caplog.text


@pytest.mark.parametrize(
    "auth0_behaviour",
    [
        {
            "status_code": 401,
            "answer_body": {
                "error": "access_denied",
                "error_description": f"Unauthorized: {CLIENT_SECRET}",
            },
        },
        {"failure_before_answer": urllib.error.URLError(TimeoutError("timed out"))},
        {
            "status_code": 307,
            "answer_headers": {"Location": "https://elsewhere.example.test/token"},
        },
    ],
    ids=["refused", "unreachable", "redirected"],
)
def test_failed_token_request_sends_nothing_and_keeps_the_secret_private(
    credential_settings, auth0, public_api, caplog, auth0_behaviour
):
    for attribute_name, value in auth0_behaviour.items():
        setattr(auth0, attribute_name, value)

    with caplog.at_level(logging.DEBUG), pytest.raises(CalculationError) as raised:
        calculate_uk_household(uk_household(), 1)

    assert len(auth0.token_requests) == 1
    assert public_api.calls == []
    assert str(raised.value) == UNAVAILABLE_MESSAGE
    error_chain = [raised.value, raised.value.__cause__, raised.value.__context__]
    assert all(CLIENT_SECRET not in repr(error) for error in error_chain)
    assert CLIENT_SECRET not in caplog.text
    assert "token" in caplog.text


@pytest.mark.parametrize(
    "auth0_behaviour",
    [
        {
            "failure_before_answer": http.client.RemoteDisconnected(
                "Remote end closed connection without response"
            )
        },
        {"failure_while_reading": ConnectionResetError(54, "Connection reset")},
        {"failure_while_reading": http.client.IncompleteRead(b'{"access_tok', 40)},
    ],
    ids=["closed-before-answer", "reset-while-reading", "incomplete-answer"],
)
def test_token_answer_that_breaks_off_gives_the_usual_json_error(
    credential_settings, auth0, public_api, caplog, auth0_behaviour
):
    from backend.web import web_app
    from fastapi.testclient import TestClient

    for attribute_name, value in auth0_behaviour.items():
        setattr(auth0, attribute_name, value)

    with (
        caplog.at_level(logging.DEBUG),
        TestClient(web_app, raise_server_exceptions=False) as client,
    ):
        response = client.post(
            "/uk/calculate",
            json={"household": uk_household(), "accounting_version": 1},
            headers={"Origin": "https://policyengine.org"},
        )

    assert response.status_code == 500
    assert response.headers.get("content-type") == "application/json"
    assert response.headers.get("access-control-allow-origin") == "*"
    assert response.json() == {"status": "error", "message": UNAVAILABLE_MESSAGE}
    assert public_api.calls == []
    assert CLIENT_SECRET not in caplog.text


def test_slow_token_request_shortens_the_public_api_timeout(
    monkeypatch, credential_settings, auth0, public_api, clock
):
    monkeypatch.setattr(time, "monotonic", lambda: clock.monotonic_seconds)
    auth0.seconds_per_request = 8

    calculate_uk_household(uk_household(), 1)

    [public_api_call] = public_api.calls
    assert public_api_call["timeout"] == pytest.approx(102)


def test_without_settings_the_request_carries_no_credential(auth0, public_api):
    calculate_uk_household(uk_household(), 1)

    assert auth0.token_requests == []
    [public_api_call] = public_api.calls
    assert public_api_call["url"] == "https://api.policyengine.org/uk/calculate"
    assert authorization(public_api_call) is None


def test_partial_settings_are_refused_before_any_request(
    monkeypatch, auth0, public_api, caplog
):
    monkeypatch.setenv("POLICYENGINE_API_URL", CONFIGURED_API_URL)
    monkeypatch.setenv("POLICYENGINE_API_AUTH0_CLIENT_SECRET", CLIENT_SECRET)

    with caplog.at_level(logging.DEBUG), pytest.raises(CalculationError) as raised:
        calculate_uk_household(uk_household(), 1)

    assert auth0.token_requests == []
    assert public_api.calls == []
    assert "POLICYENGINE_API_AUTH0_CLIENT_ID" in caplog.text
    assert CLIENT_SECRET not in caplog.text
    assert CLIENT_SECRET not in repr(raised.value)


def test_inside_modal_missing_settings_are_refused_before_any_request(
    monkeypatch, auth0, public_api, caplog
):
    monkeypatch.setattr(modal, "is_local", lambda: False)
    monkeypatch.setenv("POLICYENGINE_API_AUTH0_CLIENT_SECRET", "   ")

    with caplog.at_level(logging.DEBUG), pytest.raises(CalculationError):
        calculate_uk_household(uk_household(), 1)

    assert auth0.token_requests == []
    assert public_api.calls == []
    assert "POLICYENGINE_API_AUTH0_CLIENT_SECRET" in caplog.text


def test_modal_app_ships_every_backend_module_and_attaches_the_secret(monkeypatch):
    shipped_files = []
    requested_secrets = []
    class_options = {}

    def add_local_file(image, local_path, remote_path, **options):
        shipped_files.append((Path(local_path).resolve(), remote_path))
        return image

    def secret_from_name(name, **options):
        secret = object()
        requested_secrets.append((name, options, secret))
        return secret

    def register_class(app, **options):
        class_options.update(options)
        return lambda user_class: user_class

    monkeypatch.setattr(modal.Image, "add_local_file", add_local_file)
    monkeypatch.setattr(modal.Secret, "from_name", staticmethod(secret_from_name))
    monkeypatch.setattr(modal.App, "cls", register_class)
    # Load a private copy, so the patched decorators leave no module behind.
    module_specification = importlib.util.spec_from_file_location(
        "modal_app_under_test", BACKEND_DIRECTORY / "modal_app.py"
    )
    module_specification.loader.exec_module(
        importlib.util.module_from_spec(module_specification)
    )

    backend_modules = {
        module_path.resolve()
        for module_path in BACKEND_DIRECTORY.glob("*.py")
        if module_path.name != "modal_app.py"
    }
    assert set(shipped_files) == {
        (module_path, f"/root/backend/{module_path.name}")
        for module_path in backend_modules
    }
    assert [secret_name for secret_name, _, _ in requested_secrets] == [
        "marriage-household-api-policyengine-api"
    ]
    [(_, secret_options, secret)] = requested_secrets
    assert set(secret_options.get("required_keys", ())) == set(
        SETTING_VARIABLES.values()
    )
    assert list(class_options.get("secrets", ())) == [secret]
