"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, ShieldOff, Smartphone } from "lucide-react";
import type { DevicePairing } from "@/lib/api";
import { formatTimeAgo } from "@/lib/utils";
import { maskSenderId, channelBadgeColor } from "./pairing-utils";

interface ActiveDevicesProps {
  pairings: DevicePairing[];
  onRevoke: (channelType: string, senderId: string) => Promise<void>;
  isLoading?: boolean;
}

export function ActiveDevices({ pairings, onRevoke, isLoading }: ActiveDevicesProps) {
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleRevoke = async (channelType: string, senderId: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to revoke access for sender ${maskSenderId(senderId)} on ${channelType}?`
    );
    if (!confirmed) return;

    const key = `${channelType}:${senderId}`;
    setRevokingId(key);
    try {
      await onRevoke(channelType, senderId);
    } finally {
      setRevokingId(null);
    }
  };

  if (pairings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Paired Devices
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Smartphone className="w-10 h-10 text-muted-foreground mb-3" />
          <h3 className="text-sm font-semibold mb-1">No paired devices yet</h3>
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            Approved pairing requests will appear here. You can revoke access at any time.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Paired Devices ({pairings.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sender</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paired Since</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pairings.map((pairing) => {
              const revokeKey = `${pairing.channelType}:${pairing.senderId}`;
              const isRevoking = revokingId === revokeKey;

              return (
                <TableRow key={pairing.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono text-sm">
                        {pairing.senderName || maskSenderId(pairing.senderId)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={channelBadgeColor(pairing.channelType)}>
                      {pairing.channelType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pairing.approvedAt ? formatTimeAgo(pairing.approvedAt) : formatTimeAgo(pairing.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pairing.lastSeenAt ? formatTimeAgo(pairing.lastSeenAt) : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleRevoke(pairing.channelType, pairing.senderId)}
                      disabled={isRevoking || isLoading}
                    >
                      <ShieldOff className="w-3.5 h-3.5 mr-1" />
                      {isRevoking ? "Revoking..." : "Revoke"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
