interface Props {
  role: "user" | "assistant" | "human";
  content: string;
  createdAt: number;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("es", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function MessageBubble({ role, content, createdAt }: Props) {
  if (role === "user") {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[75%]">
          <div className="bg-white border border-[#EDE0CC] rounded-2xl rounded-tl-sm px-4 py-2 shadow-sm">
            <p className="text-[#2C1810] text-sm whitespace-pre-wrap">{content}</p>
          </div>
          <p className="text-xs text-[#B89070] mt-1 ml-1">{formatTime(createdAt)}</p>
        </div>
      </div>
    );
  }

  if (role === "assistant") {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[75%]">
          <div className="bg-[#2C1810] rounded-2xl rounded-tr-sm px-4 py-2 shadow-sm">
            <p className="text-[#FBF6EE] text-sm whitespace-pre-wrap">{content}</p>
          </div>
          <p className="text-xs text-[#B89070] mt-1 mr-1 text-right">
            {formatTime(createdAt)} · Sanca IA
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[75%]">
        <div className="bg-[#D4A843] rounded-2xl rounded-tr-sm px-4 py-2 shadow-sm">
          <p className="text-white text-sm whitespace-pre-wrap">{content}</p>
        </div>
        <p className="text-xs text-[#B89070] mt-1 mr-1 text-right">
          {formatTime(createdAt)} · Humano
        </p>
      </div>
    </div>
  );
}
