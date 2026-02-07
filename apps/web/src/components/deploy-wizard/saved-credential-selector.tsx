"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";

interface SavedCredential {
  id: string;
  name: string;
  type: string;
  maskedConfig: Record<string, string>;
  createdAt: string;
}

interface SavedCredentialSelectorProps {
  type: string;
  onSelect: (id: string) => void;
  onManual: () => void;
  selectedId: string | null;
}

function formatCredentialLabel(credential: SavedCredential): string {
  const { name, maskedConfig, type } = credential;
  switch (type) {
    case "aws-account":
      return `${name} — ${maskedConfig.accessKeyId} (${maskedConfig.region})`;
    case "azure-account":
      return `${name} — ${maskedConfig.subscriptionId} (${maskedConfig.region ?? maskedConfig.resourceGroup})`;
    case "gce-account":
      return `${name} — ${maskedConfig.projectId} (${maskedConfig.zone ?? "default"})`;
    case "api-key":
      return `${name} — ${maskedConfig.provider} (${maskedConfig.apiKey})`;
    default:
      return name;
  }
}

export function SavedCredentialSelector({
  type,
  onSelect,
  onManual,
  selectedId,
}: SavedCredentialSelectorProps) {
  const [credentials, setCredentials] = useState<SavedCredential[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listSavedCredentials(type)
      .then((data: SavedCredential[]) => {
        if (!cancelled) {
          setCredentials(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCredentials([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-10 bg-muted rounded-md" />
        <div className="h-4 w-40 bg-muted rounded" />
      </div>
    );
  }

  if (credentials.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Select
        value={selectedId ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          if (id) {
            onSelect(id);
          }
        }}
      >
        <option value="" disabled>
          Select saved credentials…
        </option>
        {credentials.map((cred) => (
          <option key={cred.id} value={cred.id}>
            {formatCredentialLabel(cred)}
          </option>
        ))}
      </Select>
      <button
        type="button"
        onClick={onManual}
        className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
      >
        Or enter new credentials
      </button>
    </div>
  );
}
