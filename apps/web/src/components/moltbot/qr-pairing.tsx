"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { QrCode, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";

export type PairingState = "loading" | "ready" | "scanning" | "success" | "expired" | "error";

interface QrPairingProps {
  channelType: string;
  qrCodeUrl?: string;
  state: PairingState;
  onRefresh?: () => void;
  onClose?: () => void;
  errorMessage?: string;
  className?: string;
}

const stateConfig: Record<PairingState, { icon: React.ReactNode; label: string; variant: "success" | "warning" | "destructive" | "secondary" | "default" }> = {
  loading: { icon: <RefreshCw className="w-4 h-4 animate-spin" />, label: "Loading...", variant: "secondary" },
  ready: { icon: <QrCode className="w-4 h-4" />, label: "Scan QR Code", variant: "default" },
  scanning: { icon: <Clock className="w-4 h-4" />, label: "Waiting...", variant: "warning" },
  success: { icon: <CheckCircle className="w-4 h-4" />, label: "Paired", variant: "success" },
  expired: { icon: <XCircle className="w-4 h-4" />, label: "Expired", variant: "destructive" },
  error: { icon: <XCircle className="w-4 h-4" />, label: "Error", variant: "destructive" },
};

export function QrPairing({
  channelType,
  qrCodeUrl,
  state,
  onRefresh,
  onClose,
  errorMessage,
  className,
}: QrPairingProps) {
  const config = stateConfig[state];

  return (
    <Card className={cn("max-w-md mx-auto", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="w-4 h-4" />
            {channelType} Pairing
          </CardTitle>
          <Badge variant={config.variant}>
            <span className="flex items-center gap-1">
              {config.icon}
              {config.label}
            </span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          {/* QR Code Display */}
          {state === "loading" && (
            <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
            </div>
          )}

          {(state === "ready" || state === "scanning") && qrCodeUrl && (
            <div className="p-4 bg-white rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCodeUrl}
                alt="QR Code for pairing"
                className="w-56 h-56 object-contain"
              />
            </div>
          )}

          {(state === "ready" || state === "scanning") && !qrCodeUrl && (
            <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No QR code available</p>
            </div>
          )}

          {state === "success" && (
            <div className="w-64 h-64 bg-green-50 rounded-lg flex flex-col items-center justify-center gap-3">
              <CheckCircle className="w-16 h-16 text-green-500" />
              <p className="text-green-700 font-medium">Successfully paired</p>
            </div>
          )}

          {state === "expired" && (
            <div className="w-64 h-64 bg-red-50 rounded-lg flex flex-col items-center justify-center gap-3">
              <Clock className="w-16 h-16 text-red-400" />
              <p className="text-red-700 font-medium">QR code expired</p>
            </div>
          )}

          {state === "error" && (
            <div className="w-64 h-64 bg-red-50 rounded-lg flex flex-col items-center justify-center gap-3">
              <XCircle className="w-16 h-16 text-red-500" />
              <p className="text-red-700 font-medium">Pairing failed</p>
              {errorMessage && (
                <p className="text-red-600 text-sm text-center px-4">{errorMessage}</p>
              )}
            </div>
          )}

          {/* Instructional text */}
          {(state === "ready" || state === "scanning") && (
            <p className="text-sm text-muted-foreground text-center">
              Open {channelType} on your phone and scan this QR code to link your bot.
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {(state === "expired" || state === "error") && onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
