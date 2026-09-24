import { pathToFileURL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      "next/server": pathToFileURL("./node_modules/next/server.js").href,
      "next/headers": pathToFileURL("./node_modules/next/headers.js").href,
      "next/navigation": pathToFileURL("./node_modules/next/navigation.js").href,
      next: pathToFileURL("./node_modules/next/index.js").href,
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "e2e/**/*.test.ts"],
    server: {
      deps: {
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
});
