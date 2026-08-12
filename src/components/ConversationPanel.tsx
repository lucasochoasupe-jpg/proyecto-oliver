"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ModeToggle from "./ModeToggle";

interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  created_at: number;
}

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
}

interface Props {
  conversationId: number;
  onDelete: () => void;
}

export default function ConversationPanel({ conversationId, onDelete }: Props) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<"AI" | "HUMAN">("AI");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/messages/${conversationId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { conversation: Conversation; messages: Message[] };
    setConv(data.conversation);
    setMode(data.conversation.mode);
    setMessages(data.messages);
  }, [conversationId]);

  useEffect(() => {
    setMessages([]);
    setConv(null);
    fetchMessages();
  }, [fetchMessages]);

  // Polling cada 2s
  useEffect(() => {
    const id = setInterval(fetchMessages, 2_000);
    return () => clearInterval(id);
  }, [fetchMessages]);

  // Scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    await fetch(`/api/messages/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    await fetchMessages();
    setSending(false);
  }

  async function confirmDelete() {
    await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
    setShowDeleteConfirm(false);
    onDelete();
  }

  if (!conv) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Cargando...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header del panel */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EDE0CC] bg-white shrink-0">
        <div>
          <p className="font-semibold text-[#2C1810]">{conv.name ?? conv.phone}</p>
          {conv.name && <p className="text-xs text-[#8B6347]">{conv.phone}</p>}
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle
            conversationId={conv.id}
            mode={mode}
            onChange={(m) => setMode(m)}
          />
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            Borrar
          </button>
        </div>
      </div>

      {/* Mensajes */}
      <div
        className="flex-1 overflow-y-auto px-5 py-4"
        style={{ backgroundColor: "#FBF6EE" }}
      >
        {messages.length === 0 ? (
          <p className="text-center text-[#B89070] text-sm mt-10">Sin mensajes</p>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              createdAt={msg.created_at}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-5 py-3 border-t border-[#EDE0CC] bg-white shrink-0">
        {mode === "AI" ? (
          <p className="text-center text-sm text-[#B89070] py-2">
            Sanca responde automáticamente
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Escribe un mensaje..."
              className="flex-1 border border-[#EDE0CC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A843] text-[#2C1810] bg-[#FBF6EE]"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="bg-[#D4A843] hover:bg-[#C49733] disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Enviar
            </button>
          </div>
        )}
      </div>

      {/* Diálogo de confirmación de borrado */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4 border border-[#EDE0CC]">
            <h3 className="font-semibold text-[#2C1810] mb-2">Borrar conversación</h3>
            <p className="text-sm text-[#8B6347] mb-5">
              Se eliminarán todos los mensajes de esta conversación. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-[#8B6347] hover:text-[#2C1810] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
