/** @type {import('next').NextConfig} */

// Production: path-scoped assets under /us/marriage/ so the app can be served
// as a multizone under policyengine.org/us/marriage via next.config.ts rewrites
// in policyengine-app-v2/website.
// Local dev: set NEXT_PUBLIC_BASE_PATH="" to run at localhost root.
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH === ""
    ? undefined
    : process.env.NEXT_PUBLIC_BASE_PATH || "/us/marriage";

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  output: "standalone",
  reactStrictMode: true,
};

module.exports = nextConfig;
