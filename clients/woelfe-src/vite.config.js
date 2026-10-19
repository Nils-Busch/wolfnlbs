import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Für die Oberflächen-Entwicklung mit Hot-Reload: in einem Terminal "npm run dev"
// (startet Worker + Durable Objects lokal auf Port 8787), in einem zweiten
// "npm run dev:client". Vite leitet /api (inkl. WebSockets) an den Worker weiter.
export default defineConfig({
  plugins: [react()],
  base: "/woelfe/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        ws: true,
      },
    },
  },
  build: {
    // Baut direkt in den gemeinsamen Assets-Ordner, den Cloudflare ausliefert.
    outDir: "../../client-assets/woelfe",
    emptyOutDir: true,
  },
});
