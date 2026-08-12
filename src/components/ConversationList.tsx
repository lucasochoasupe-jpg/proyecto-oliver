"use client";

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  last_message_preview: string | null;
}

interface Props {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

export default function ConversationList({ conversations, selectedId, onSelect }: Props) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#8B6347] text-sm p-6 text-center">
        <p className="font-medium">Sin conversaciones</p>
        <p className="mt-1 text-xs opacity-70">Cuando alguien te escriba al WhatsApp aparecerá aquí.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[#EDE0CC] overflow-y-auto h-full">
      {conversations.map((conv) => (
        <li key={conv.id}>
          <button
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-4 py-3 transition-colors ${
              selectedId === conv.id
                ? "bg-[#F5E6C8] border-l-4 border-[#D4A843]"
                : "hover:bg-[#F5E6C8]/50 border-l-4 border-transparent"
            }`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="font-semibold text-sm text-[#2C1810] truncate flex-1 mr-2">
                {conv.name ?? conv.phone}
              </span>
              <span
                className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                  conv.mode === "AI"
                    ? "bg-[#2C1810] text-[#D4A843]"
                    : "bg-[#D4A843] text-[#2C1810]"
                }`}
              >
                {conv.mode === "AI" ? "IA" : "HUM"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#8B6347] truncate flex-1 mr-2">
                {conv.last_message_preview ?? "Sin mensajes"}
              </p>
              <span className="text-xs text-[#B89070] shrink-0">
                {relativeTime(conv.last_message_at)}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
