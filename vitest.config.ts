import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "packages/shared/src"),
    },
  },
  test: {
    environment: "node",
    // Web component tests opt into a browser-like environment individually
    // with a `// @vitest-environment jsdom` comment at the top of the file,
    // since most of this project's tests are backend tests that must stay
    // in the (default, faster) node environment.
    setupFiles: ["apps/web/src/testSupport/vitestSetup.ts"],
    // Several test files are integration tests against a real, shared
    // PostgreSQL test database and a real, shared Redis instance (not a
    // mock or an in-memory fake). Running test files in parallel would let
    // one file's cleanup (TRUNCATE / key deletion) race against another
    // file's inserts on that same shared data, producing flaky failures
    // that have nothing to do with the code under test. Files still run
    // fast because each file's own tests are cheap; only cross-file
    // parallelism is disabled.
    fileParallelism: false,
  },
});
