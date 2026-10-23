import type { Metadata } from "next";
import { Fraunces, Geist } from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

// Geist para el texto; Fraunces (serif cálida, de panadería) para los títulos.
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Sanca — Panadería San Cayetano II",
  description: "Dashboard de gestión de conversaciones — Panadería San Cayetano II",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${geist.variable} ${fraunces.variable}`}>
      <body className="bg-[#FBF6EE] text-[#1A0F08] antialiased font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
