import { Suspense } from "react";
import ConnectionGate from "@/components/ConnectionGate";

export default function Home() {
  return (
    <Suspense>
      <ConnectionGate />
    </Suspense>
  );
}
