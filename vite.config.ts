import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, mkdirSync, cpSync, existsSync } from "node:fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function copyUxpHostFiles(): Plugin {
  return {
    name: "copy-uxp-host-files",
    closeBundle() {
      const distRoot = resolve(__dirname, "dist");
      mkdirSync(distRoot, { recursive: true });
      copyFileSync(resolve(__dirname, "manifest.json"), resolve(distRoot, "manifest.json"));
      copyFileSync(resolve(__dirname, "src/uxp/index.html"), resolve(distRoot, "index.html"));
      copyFileSync(resolve(__dirname, "src/uxp/host.js"), resolve(distRoot, "host.js"));

      const iconsSrc = resolve(__dirname, "icons");
      if (existsSync(iconsSrc)) {
        cpSync(iconsSrc, resolve(distRoot, "icons"), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: "./",
  root: resolve(__dirname, "src/webview"),
  plugins: [react(), copyUxpHostFiles()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@webview": resolve(__dirname, "src/webview"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist/webview"),
    emptyOutDir: true,
  },
});
