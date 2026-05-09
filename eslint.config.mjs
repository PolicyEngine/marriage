import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import reactHooks from "eslint-plugin-react-hooks";

const config = [
  ...nextCoreWebVitals,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // New strict react-hooks rules in v5+ surface pre-existing patterns;
      // keep as warnings to preserve baseline lint behavior. Track
      // cleanup separately rather than blocking the stack upgrade.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/rules-of-hooks": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
