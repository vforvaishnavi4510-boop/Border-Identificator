import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

export default defineConfig({
  plugins: [react()],

  server: {
    host: "0.0.0.0",
    port: 5173,

    https: {
      key: fs.readFileSync("./10.60.69.38+2-key.pem"),
      cert: fs.readFileSync("./10.60.69.38+2.pem"),
    },

    // Send /api requests to our local Node backend
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});