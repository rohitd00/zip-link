// ESLint flat configuration shared by every workspace in this project.
// The rules below exist to enforce the project's "humanized, verbose code"
// requirement: no implicit any, no nested ternaries, no unused values.

const tsEslintPlugin = require("@typescript-eslint/eslint-plugin");
const tsEslintParser = require("@typescript-eslint/parser");
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
  prettierConfig,
];
