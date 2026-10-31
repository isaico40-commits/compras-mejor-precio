import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Compras al mejor precio",
  description: "Tu lista de compras frecuentes y dónde te conviene comprar cada cosa en Mar del Plata.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
