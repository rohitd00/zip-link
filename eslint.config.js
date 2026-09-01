// ESLint flat configuration shared by every workspace in this project.
// The rules below exist to enforce the project's "humanized, verbose code"
// requirement: no implicit any, no nested ternaries, no unused values.

const tsEslintPlugin = require("@typescript-eslint/eslint-plugin");
const tsEslintParser = require("@typescript-eslint/parser");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const reactRefreshPlugin = require("eslint-plugin-react-refresh").default;
const prettierConfig = require("eslint-config-prettier");

module.exports = [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsEslintParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsEslintPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": ["warn", { allowExpressions: true }],
      "no-nested-ternary": "error",
      "no-else-return": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      "no-var": "error",
    },
  },
  {
    // React-specific rules apply only to the dashboard app.
    files: ["apps/web/**/*.tsx", "apps/web/**/*.ts"],
    plugins: {
      "react-hooks": reactHooksPlugin,
      "react-refresh": reactRefreshPlugin,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Component prop types commonly need explicit interfaces already, but
      // requiring a return type on every small inline component is noisier
      // than useful in JSX-heavy files.
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  prettierConfig,
];
