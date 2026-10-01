import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite 8 transforms TSX with Oxc; automatic runtime matches tsconfig "jsx": "react-jsx".
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
