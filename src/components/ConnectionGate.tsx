"use client";

import { useCallback, useEffect, useState } from "react";
import QRScreen from "./QRScreen";
import DashboardHeader from "./DashboardHeader";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import { useSidebarHidden } from "./AppShell";

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  last_message_preview: string | null;
}

type AppStatus = "loading" | "qr" | "connected";

export default function ConnectionGate() {
  const [appStatus, setAppStatus] = useState<AppStatus>("loading");
  const [phone, setPhone] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useSidebarHidden(appStatus !== "connected");

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/connection/status");
      const data = (await res.json()) as {
        status: string;
        phone?: string;
        qrPng?: string;
      };
      if (data.status === "connected" && data.phone) {
        setPhone(data.phone);
        setAppStatus("connected");
      } else {
        setAppStatus((prev) => (prev === "connected" ? "connected" : "qr"));
      }
    } catch {
      setAppStatus("qr");
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = (await res.json()) as Conversation[];
      setConversations(data);
    } catch {}
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Cuando está conectado, poll de conversaciones cada 2s
  useEffect(() => {
    if (appStatus !== "connected") return;
    fetchConversations();
    const id = setInterval(fetchConversations, 2_000);
    return () => clearInterval(id);
  }, [appStatus, fetchConversations]);

  function handleConnected(connectedPhone: string) {
    setPhone(connectedPhone);
    setAppStatus("connected");
  }

  function handleDisconnect() {
    setPhone("");
    setSelectedId(null);
    setConversations([]);
    setAppStatus("qr");
  }

  function handleDeleteConversation() {
    setSelectedId(null);
    fetchConversations();
  }

  if (appStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (appStatus === "qr") {
    return <QRScreen onConnected={handleConnected} />;
  }

  return (
    <div className="flex flex-col h-screen">
      <DashboardHeader phone={phone} onDisconnect={handleDisconnect} />
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Lista de conversaciones */}
        <aside className="w-80 shrink-0 border-r border-[#EDE0CC] bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-[#EDE0CC]">
            <h2 className="text-xs font-bold text-[#8B6347] uppercase tracking-widest">
              Conversaciones
            </h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </aside>

        {/* Panel de conversación */}
        <main className="flex-1 overflow-hidden min-h-0 flex flex-col">
          {selectedId ? (
            <ConversationPanel
              key={selectedId}
              conversationId={selectedId}
              onDelete={handleDeleteConversation}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <img src="/logo.png" alt="Logo" className="w-32 h-32 object-contain opacity-20" />
              <p className="text-[#B89070] text-sm">Seleccioná una conversación</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
