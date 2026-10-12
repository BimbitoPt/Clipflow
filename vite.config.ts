import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  publicDir: process.env.TAURI_ENV_PLATFORM ? '.desktop-public' : 'public',
  // NOTE: `as any` works around TS2769 from dual Vite 7 copies (vite@7.3.6 top-level vs vitest@3.2.7 bundled vite@7.3.6): Plugin types carry private members so the two copies are never mutually assignable; runtime unaffected.
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: Boolean(process.env.TAURI_ENV_PLATFORM),
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webp,jpg,jpeg}"],
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
      manifest: {
        background_color: "#080A0D",
        categories: ["creativity", "video", "productivity"],
        description: "Idea in, video out — script, keyframes, captions and MP4 export, local-first.",
        display: "standalone",
        icons: [
          { sizes: "192x192", src: "icon-192.png", type: "image/png", purpose: "any" },
          { sizes: "512x512", src: "icon-512.png", type: "image/png", purpose: "any" },
          { sizes: "512x512", src: "icon-512.png", type: "image/png", purpose: "maskable" },
        ],
        name: "Clipflow",
        short_name: "Clipflow",
        start_url: ".",
        theme_color: "#080A0D",
      },
    }),
  ] as any,
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
