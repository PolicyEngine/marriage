"""Deploy with: uv run --project backend modal deploy backend/modal_app.py."""

from pathlib import Path

import modal

app = modal.App("marriage-household-api")
backend_dir = Path(__file__).parent
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_sync(uv_project_dir=backend_dir, frozen=True, groups=[])
    .add_local_file(backend_dir / "__init__.py", "/root/backend/__init__.py")
    .add_local_file(backend_dir / "simulation.py", "/root/backend/simulation.py")
    .add_local_file(backend_dir / "accounting.py", "/root/backend/accounting.py")
    .add_local_file(backend_dir / "web.py", "/root/backend/web.py")
    .add_local_file(backend_dir / "uk.py", "/root/backend/uk.py")
    .add_local_file(backend_dir / "public_api.py", "/root/backend/public_api.py")
    .add_local_file(
        backend_dir / "public_api_token.py", "/root/backend/public_api_token.py"
    )
)
# The Public API address and this backend's Auth0 client (backend/public_api.py).
# Deploying fails if the secret or any of these keys is missing.
public_api_secret = modal.Secret.from_name(
    "marriage-household-api-policyengine-api",
    required_keys=[
        "POLICYENGINE_API_URL",
        "POLICYENGINE_API_AUTH0_DOMAIN",
        "POLICYENGINE_API_AUTH0_AUDIENCE",
        "POLICYENGINE_API_AUTH0_CLIENT_ID",
        "POLICYENGINE_API_AUTH0_CLIENT_SECRET",
    ],
)


@app.cls(
    image=image,
    secrets=[public_api_secret],
    cpu=2,
    memory=8192,
    timeout=120,
    min_containers=0,
    max_containers=8,
    scaledown_window=300,
    enable_memory_snapshot=True,
)
@modal.concurrent(max_inputs=3)
class HouseholdAPI:
    @modal.enter(snap=True)
    def load_model(self):
        # Snapshot both accounting variants and metadata; no population data is
        # needed. Containers scale to zero after 300 seconds idle; a new
        # container restores the loaded model from this snapshot.
        from backend.simulation import build_metadata, get_system

        get_system(False)
        get_system(True)
        build_metadata()

    @modal.asgi_app()
    def api(self):
        from backend.web import web_app

        return web_app
