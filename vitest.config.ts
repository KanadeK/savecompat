import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["**/src/cli.ts", "**/src/index.ts", "**/src/types.ts", "**/src/version.ts"],
      thresholds: {
        branches: 65,
        functions: 85,
        lines: 70,
        statements: 70,
      },
    },
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
