"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const STORAGE_KEY = "sanca_sidebar_collapsed";

const SetSidebarHiddenContext = createContext<(hidden: boolean) => void>(() => {});

// Permite que una página (ej. la pantalla de QR de WhatsApp) oculte el sidebar
// mientras está montada — se restaura solo al desmontarse.
export function useSidebarHidden(hidden: boolean) {
  const setHidden = useContext(SetSidebarHiddenContext);
  useEffect(() => {
    setHidden(hidden);
    return () => setHidden(false);
  }, [hidden, setHidden]);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hiddenByPage, setHiddenByPage] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  // Cerrar el drawer mobile al navegar a otra página.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const showSidebar = !hiddenByPage;

  return (
    <SetSidebarHiddenContext.Provider value={setHiddenByPage}>
      <div className="min-h-screen">
        {showSidebar && (
          <Sidebar
            collapsed={collapsed}
            onToggle={toggle}
            mobileOpen={mobileOpen}
            onMobileToggle={() => setMobileOpen((p) => !p)}
            onMobileClose={() => setMobileOpen(false)}
          />
        )}
        <div
          className={
            showSidebar
              ? collapsed
                ? "transition-all duration-200 md:ml-16"
                : "transition-all duration-200 md:ml-56"
              : ""
          }
        >
          {children}
        </div>
      </div>
    </SetSidebarHiddenContext.Provider>
  );
}
