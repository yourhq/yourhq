import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/__tests__/helpers/server-only-stub.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/__tests__/helpers/setup.ts"],
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/lib/**",
        "src/hooks/**",
        "src/app/dashboard/**/actions.ts",
        "src/app/api/**/route.ts",
        "src/components/**",
      ],
      exclude: [
        "**/*.d.ts",
        "**/types.ts",
        "**/types/**",
        "src/components/ui/**",
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
      ],
    },
  },
});
