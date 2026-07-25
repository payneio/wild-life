import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Allow reaching the dev server by LAN hostname (e.g. http://civil:5199)
    // and through the payne.io gateway, not just localhost.
    allowedHosts: ["civil", ".payne.io", "localhost"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
})
