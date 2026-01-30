"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Check, X, CheckCheck, Smartphone } from "lucide-react";
import type { DevicePairing } from "@/lib/api";
import { formatTimeAgo } from "@/lib/utils";
import { maskSenderId, channelBadgeColor } from "./pairing-utils";

interface PendingListProps {
  pairings: DevicePairing[];
  onApprove: (channelType: string, senderId: string) => Promise<void>;
  onReject: (channelType: string, senderId: string) => Promise<void>;
  onApproveAll: () => Promise<void>;
  isLoading?: boolean;
}

export function PendingList({ pairings, onApprove, onReject, onApproveAll, isLoading }: PendingListProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  const handleApprove = async (channelType: string, senderId: string) => {
    const key = `${channelType}:${senderId}`;
    setLoadingId(key);
    try {
      await onApprove(channelType, senderId);
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (channelType: string, senderId: string) => {
    const key = `reject:${channelType}:${senderId}`;
    setLoadingId(key);
    try {
      await onReject(channelType, senderId);
    } finally {
      setLoadingId(null);
    }
  };

  const handleApproveAll = async () => {
    setIsApprovingAll(true);
    try {
      await onApproveAll();
    } finally {
      setIsApprovingAll(false);
    }
  };

  if (pairings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Smartphone className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No pending pairing requests</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            When someone sends a DM to your bot with pairing mode enabled, their request will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Pending Requests ({pairings.length})
        </h3>
        {pairings.length >= 2 && (
          <Button
            size="sm"
            onClick={handleApproveAll}
            disabled={isApprovingAll || isLoading}
          >
            <CheckCheck className="w-4 h-4 mr-1.5" />
            {isApprovingAll ? "Approving..." : "Approve All"}
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {pairings.map((pairing) => {
          const approveKey = `${pairing.channelType}:${pairing.senderId}`;
          const rejectKey = `reject:${pairing.channelType}:${pairing.senderId}`;
          const isApproving = loadingId === approveKey;
          const isRejecting = loadingId === rejectKey;

          return (
            <Card key={pairing.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-muted-foreground" />
                    <span className="font-mono text-sm font-medium">
                      {maskSenderId(pairing.senderId)}
                    </span>
                  </div>
                  <Badge variant="outline" className={channelBadgeColor(pairing.channelType)}>
                    {pairing.channelType}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTimeAgo(pairing.createdAt)}</span>
                  {pairing.deviceInfo && (
                    <>
                      <span className="text-muted-foreground/50">|</span>
                      <span>{pairing.deviceInfo}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleApprove(pairing.channelType, pairing.senderId)}
                    disabled={isApproving || isRejecting || isLoading}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    {isApproving ? "Approving..." : "Approve"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => handleReject(pairing.channelType, pairing.senderId)}
                    disabled={isApproving || isRejecting || isLoading}
                  >
                    <X className="w-4 h-4 mr-1" />
                    {isRejecting ? "Rejecting..." : "Reject"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
