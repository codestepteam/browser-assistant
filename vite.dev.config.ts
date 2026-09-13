import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "zod",
    ],
  },
  resolve: { dedupe: ["react", "react-dom"] },
  server: {
    host: "0.0.0.0",
    port: 4186,
    strictPort: true,
    allowedHosts: ["macmini"],
  },
});
