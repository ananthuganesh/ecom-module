import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // React Compiler lint is too aggressive for common hydration / mount /
      // external-store sync patterns used across admin + storefront.
      "react-hooks/set-state-in-effect": "off",
      // TanStack Table returns unstable function identities by design.
      "react-hooks/incompatible-library": "off",
      // Many effects intentionally omit volatile callbacks / one-shot trackers.
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);

export default eslintConfig;
