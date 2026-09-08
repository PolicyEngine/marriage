// Standard CI must never silently depend on a deployed model or public UK API.
const nativeFetch = globalThis.fetch;
const configured = process.env.NEXT_PUBLIC_US_API_URL;
if (!configured || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(configured).hostname)) {
  throw new Error("Standard tests require the pinned local API. Run bun run test:ci.");
}
const localOrigin = new URL(configured).origin;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== localOrigin || url.pathname.startsWith("/uk/")) {
    throw new Error(`External API calls are disabled in standard CI: ${url.origin}. Use bun run test:live:uk for UK integration checks.`);
  }
  return nativeFetch(input, init);
};
