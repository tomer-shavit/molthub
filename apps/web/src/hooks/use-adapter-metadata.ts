"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { AdapterMetadata } from "@/lib/api";

export function useAdapterMetadata() {
  const [adapters, setAdapters] = useState<AdapterMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAdapters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listAdapters();
      setAdapters(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deployment targets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdapters();
  }, [fetchAdapters]);

  return { adapters, loading, error, refetch: fetchAdapters };
}
