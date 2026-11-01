import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Compras al mejor precio",
    short_name: "Compras",
    description: "Tu lista de compras y dónde conviene comprar cada cosa en Mar del Plata.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f0",
    theme_color: "#1f7a4d",
    lang: "es-AR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
