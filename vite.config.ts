import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/study-duckdb-wasm-fts/" : "/",
  build: {
    target: "esnext",
  },
  plugins: [react(), wasm()],
});
