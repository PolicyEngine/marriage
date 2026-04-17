import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel serves this app at the deployment root, so assets resolve from "/"
// (production is embedded at policyengine.org/us/marriage via the apps iframe).
export default defineConfig({
  plugins: [react()],
  base: "/",
});
