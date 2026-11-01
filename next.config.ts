import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
    // Volver a una pestaña ya vista es instantáneo (se refresca sola al guardar algo)
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default nextConfig;
