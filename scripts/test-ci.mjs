/** Start the pinned local backend, run deterministic frontend tests, and stop it. */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";

const args = process.argv.slice(2);
const liveUk = args[0] === "--live-uk";
if (liveUk) args.shift();
const listener = createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const url = `http://127.0.0.1:${port}`;
const metadata = JSON.parse(await readFile(new URL("../lib/metadata.json", import.meta.url), "utf8"));
const backend = spawn("uv", ["run", "--project", "backend", "--no-sync", "uvicorn",
  "backend.web:web_app", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let backendLog = "";
let backendError;
for (const stream of [backend.stdout, backend.stderr]) {
  stream.on("data", chunk => { backendLog = (backendLog + chunk.toString()).slice(-32000); });
}
backend.on("error", error => { backendError = error; });
let tests;
const cancel = () => { tests?.kill("SIGTERM"); backend.kill("SIGTERM"); };
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
try {
  const deadline = Date.now() + 180000;
  let ready = false;
  while (Date.now() < deadline) {
    if (backendError) throw backendError;
    if (backend.exitCode !== null || backend.signalCode !== null) throw new Error("The local backend exited before becoming ready.");
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const health = await response.json();
        if (health.status === "ok" && health.model_version === metadata.modelVersion) { ready = true; break; }
      }
    } catch { /* The model may still be importing. */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("The pinned local backend did not become ready within three minutes.");
  console.log(`Testing against local PolicyEngine US ${metadata.modelVersion} at ${url}`);
  tests = spawn("bun", ["run", liveUk ? "test:frontend:live:uk" : "test:frontend", ...args], {
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_US_API_URL: url },
  });
  const [code, signal] = await once(tests, "exit");
  process.exitCode = code ?? (signal ? 1 : 0);
  if (process.exitCode) console.error(backendLog);
} catch (error) {
  console.error(error.message);
  console.error(backendLog);
  process.exitCode = 1;
} finally {
  backend.kill("SIGTERM");
  const forceStop = setTimeout(() => backend.kill("SIGKILL"), 5000);
  forceStop.unref();
  if (backend.exitCode === null && backend.signalCode === null) await once(backend, "exit");
  clearTimeout(forceStop);
}
