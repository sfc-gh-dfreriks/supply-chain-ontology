import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // "/" for local and for the server-backed build; set BASE_PATH=/<repo>/ for
  // GitHub Pages, where the site is served from a subdirectory.
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  server: {
    port: Number(process.env.CLIENT_PORT) || 5179,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT || 3009}`,
        changeOrigin: true,
      },
    },
  },
});
