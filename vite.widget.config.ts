import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { "process.env.NODE_ENV": '"production"' },
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/client/widget.tsx",
      name: "BrowserAssistant",
      formats: ["iife"],
      fileName: () => "widget.js",
    },
  },
});
