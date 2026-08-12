"use client";

interface Props {
  conversationId: number;
  mode: "AI" | "HUMAN";
  onChange: (mode: "AI" | "HUMAN") => void;
}

export default function ModeToggle({ conversationId, mode, onChange }: Props) {
  async function toggle() {
    const next = mode === "AI" ? "HUMAN" : "AI";
    await fetch(`/api/mode/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    onChange(next);
  }

  const isAI = mode === "AI";

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-semibold transition-colors ${isAI ? "text-[#2C1810]" : "text-[#B89070]"}`}>
        IA
      </span>
      <button
        onClick={toggle}
        role="switch"
        aria-checked={!isAI}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
          isAI
            ? "border-[#2C1810] bg-[#2C1810]"
            : "border-[#D4A843] bg-[#D4A843]"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
            isAI ? "translate-x-0.5" : "translate-x-5"
          }`}
        />
      </button>
      <span className={`text-xs font-semibold transition-colors ${!isAI ? "text-[#D4A843]" : "text-[#B89070]"}`}>
        Humano
      </span>
    </div>
  );
}
