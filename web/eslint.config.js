import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import importX from "eslint-plugin-import-x"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { "import-x": importX },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      "import-x/resolver": { typescript: true },
    },
    rules: {
      // Catch circular imports (a runtime crash tsc can't see) at lint time.
      "import-x/no-cycle": ["error", { maxDepth: 6 }],
      // Belt to the branded-types suspenders: slicing a day out of an ISO
      // timestamp gives the UTC day, not the local one. Route through @/lib/date.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(slice|replace)$/][callee.object.callee.property.name='toISOString']",
          message:
            "Don't derive a day/stamp from toISOString() (that's UTC). Use the branded helpers in @/lib/date (dayOf / today / asDay / rruleDtstart).",
        },
      ],
    },
  },
  {
    // @/lib/date is the one place allowed to touch raw Date/toISOString.
    files: ["src/lib/date.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
])
