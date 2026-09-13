import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
export default defineConfig({
  root: "examples",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist/examples",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        html: resolve("examples/index.html"),
        react: resolve("examples/react/index.html"),
      },
    },
  },
});
