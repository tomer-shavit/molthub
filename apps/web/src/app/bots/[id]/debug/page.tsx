import { api } from "@/lib/api";
import { DebugClient } from "./debug-client";

interface DebugPageProps {
  params: { id: string };
}

async function getBotData(id: string) {
  try {
    const instance = await api.getBotInstance(id);
    return { instance };
  } catch {
    return { instance: null };
  }
}

export default async function DebugPage({ params }: DebugPageProps) {
  const { instance } = await getBotData(params.id);

  if (!instance) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-red-600">Instance not found</h1>
        <p className="mt-2 text-gray-600">
          The bot instance with ID &quot;{params.id}&quot; could not be loaded.
        </p>
      </div>
    );
  }

  return <DebugClient instanceId={instance.id} instanceName={instance.name} />;
}
