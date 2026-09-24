import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-redux': ['@reduxjs/toolkit', 'react-redux'],
          'vendor-ui': ['sonner', 'lucide-react', 'qrcode.react', 'formik', 'yup'],
          'vendor-pdf': ['pdfjs-dist'],
          'vendor-map': ['leaflet', 'react-leaflet', 'leaflet.markercluster'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});