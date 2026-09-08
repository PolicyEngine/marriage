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
    .add_local_file(backend_dir / "web.py", "/root/backend/web.py")
)


@app.cls(
    image=image,
    cpu=2,
    memory=4096,
    timeout=120,
    max_containers=8,
    scaledown_window=60,
    enable_memory_snapshot=True,
)
@modal.concurrent(max_inputs=1)
class HouseholdAPI:
    @modal.enter(snap=True)
    def load_model(self):
        # Snapshot both accounting variants and metadata; no population data is
        # needed. Containers scale to zero, restoring the loaded model on demand.
        from backend.simulation import build_metadata, get_system

        get_system(False)
        get_system(True)
        build_metadata()

    @modal.asgi_app()
    def api(self):
        from backend.web import web_app

        return web_app
