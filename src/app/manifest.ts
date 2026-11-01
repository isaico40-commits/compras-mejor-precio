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
    // Compartir desde Samsung Notes, WhatsApp o cualquier app -> "Compras"
    share_target: { action: "/agregar", method: "GET", params: { title: "title", text: "text", url: "url" } },
    // Mantener apretado el ícono
    shortcuts: [
      { name: "Dictar compras", short_name: "Dictar", url: "/agregar?voz=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "En el súper", short_name: "En el súper", url: "/super", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Descuentos de hoy", short_name: "Descuentos", url: "/descuentos", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
