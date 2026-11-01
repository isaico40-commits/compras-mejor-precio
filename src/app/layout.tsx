import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Compras",
  description: "Tu lista de compras y dónde te conviene comprar cada cosa en Mar del Plata.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f5f0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh font-sans antialiased">
        <div className="mx-auto max-w-xl pb-24">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
