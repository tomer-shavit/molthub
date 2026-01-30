"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type DevicePairing } from "@/lib/api";
import { PendingList } from "./pending-list";
import { ActiveDevices } from "./active-devices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ChevronDown, ChevronRight, ShieldOff } from "lucide-react";
import { maskSenderId } from "./pairing-utils";

interface PairingTabProps {
  botId: string;
}

export function PairingTab({ botId }: PairingTabProps) {
  const [pairings, setPairings] = useState<DevicePairing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);

  const fetchPairings = useCallback(async () => {
    try {
      const data = await api.getPairings(botId);
      setPairings(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pairings");
    } finally {
      setIsLoading(false);
    }
  }, [botId]);

  // Initial fetch
  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  // Poll for pending pairings every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await api.getPairings(botId);
        setPairings(data);
      } catch {
        // Silent fail on polling
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [botId]);

  const pendingPairings = pairings.filter((p) => p.state === "PENDING");
  const activePairings = pairings.filter((p) => p.state === "APPROVED");
  const revokedPairings = pairings.filter((p) => p.state === "REVOKED" || p.state === "REJECTED" || p.state === "EXPIRED");

  const handleApprove = useCallback(async (channelType: string, senderId: string) => {
    await api.approvePairing(botId, channelType, senderId);
    await fetchPairings();
  }, [botId, fetchPairings]);

  const handleReject = useCallback(async (channelType: string, senderId: string) => {
    await api.rejectPairing(botId, channelType, senderId);
    await fetchPairings();
  }, [botId, fetchPairings]);

  const handleApproveAll = useCallback(async () => {
    await api.approveAllPairings(botId);
    await fetchPairings();
  }, [botId, fetchPairings]);

  const handleRevoke = useCallback(async (channelType: string, senderId: string) => {
    await api.revokePairing(botId, channelType, senderId);
    await fetchPairings();
  }, [botId, fetchPairings]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await api.syncPairings(botId);
      await fetchPairings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync pairings");
    } finally {
      setIsSyncing(false);
    }
  }, [botId, fetchPairings]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-7 w-48 bg-muted animate-pulse rounded" />
          <div className="h-9 w-40 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-4">
                <div className="h-20 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6 pb-6">
            <div className="h-32 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchPairings}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Sync button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Device Pairing</h2>
          <p className="text-sm text-muted-foreground">
            Manage paired devices and approve new pairing requests
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync from Gateway"}
        </Button>
      </div>

      {/* Pending Pairing Requests */}
      <PendingList
        pairings={pendingPairings}
        onApprove={handleApprove}
        onReject={handleReject}
        onApproveAll={handleApproveAll}
      />

      {/* Active Paired Devices */}
      <ActiveDevices
        pairings={activePairings}
        onRevoke={handleRevoke}
      />

      {/* Revoked/Rejected/Expired Section (collapsible) */}
      {revokedPairings.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setShowRevoked(!showRevoked)}
          >
            <CardTitle className="text-base flex items-center gap-2">
              {showRevoked ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <ShieldOff className="w-4 h-4 text-muted-foreground" />
              Revoked / Rejected / Expired
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {revokedPairings.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          {showRevoked && (
            <CardContent>
              <div className="space-y-2">
                {revokedPairings.map((pairing) => (
                  <div
                    key={pairing.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono">
                        {maskSenderId(pairing.senderId)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {pairing.channelType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Badge
                        variant="outline"
                        className={
                          pairing.state === "REVOKED"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : pairing.state === "REJECTED"
                            ? "bg-orange-50 text-orange-700 border-orange-200"
                            : "bg-gray-50 text-gray-700 border-gray-200"
                        }
                      >
                        {pairing.state}
                      </Badge>
                      <span className="text-xs">
                        {pairing.revokedAt
                          ? `Revoked ${new Date(pairing.revokedAt).toLocaleDateString()}`
                          : `Updated ${new Date(pairing.updatedAt).toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
