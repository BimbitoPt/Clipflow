import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // NOTE: `as any` works around Vite 8 (rolldown) vs vitest 3 (bundled Vite 7) Plugin type divergence; runtime unaffected.
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        background_color: "#080A0D",
        display: "standalone",
        icons: [
          { sizes: "192x192", src: "icon-192.png", type: "image/png" },
          { sizes: "512x512", src: "icon-512.png", type: "image/png" },
        ],
        name: "Clipflow",
        short_name: "Clipflow",
        start_url: ".",
        theme_color: "#080A0D",
      },
    }),
  ] as any,
  test: {
    environment: "node",
  },
});
