"use client";

import PageHeader from "./PageHeader";

interface Props {
  phone: string;
  onDisconnect: () => void;
}

export default function DashboardHeader({ phone, onDisconnect }: Props) {
  return <PageHeader subtitle={`Sanca · ${phone}`} onDisconnect={onDisconnect} />;
}
