import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import config from "./vitest.config.js";

export default mergeConfig(config, defineConfig({
  test: {
    // Each integration test may already request three 1,089-point model grids.
    maxWorkers: 1,
    setupFiles: ["./tests/setup-local-api.js"],
    exclude: [...configDefaults.exclude,
      "tests/uk-api-live.test.js", "tests/uk-live.test.js", "tests/uk-combinations.test.js",
      // Historical model fixtures have their own manual audit command; they
      // are not a substitute for the pinned-runtime integration assertions.
      "tests/audit-values.test.js",
    ],
  },
}));
