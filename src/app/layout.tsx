import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

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
    <html lang="es">
      <body className="bg-[#FBF6EE] text-[#1A0F08] antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
