import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    lib: {
      entry: {
        client: "src/client/index.tsx",
        core: "src/client/core.ts",
        protocol: "src/protocol.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    },
  },
});
