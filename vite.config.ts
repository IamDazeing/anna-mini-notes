import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "anna-tool-ids-sidecar",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          // `anna-app dev` and publishing overwrite this public-file copy
          // with the handle -> server-minted tool identity mapping. Injecting after
          // Vite's HTML transform keeps the file external instead of bundling
          // a development-only id into the production JavaScript.
          return html.replace(
            "<head>",
            '<head>\n    <script src="./anna-tool-ids.js"></script>'
          );
        }
      }
    }
  ],
  base: "./",
  build: {
    outDir: "bundle",
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      external: ["/static/anna-apps/_sdk/latest/index.js"]
    }
  }
});
