import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/study-duckdb-wasm-fts/" : "/",
  build: {
    target: "esnext",
  },
  // lindera-wasm v2 は事前バンドルすると wasm 初期化に失敗するため除外する
  optimizeDeps: {
    exclude: ["lindera-wasm-web-ipadic"],
  },
  plugins: [react(), wasm()],
});
