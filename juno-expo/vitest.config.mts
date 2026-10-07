import { defineConfig } from "vitest/config";

// Pure-logic tests for the app (formatting, streak maths). Run with `npm test`.
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
