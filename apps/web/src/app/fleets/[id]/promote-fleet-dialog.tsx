"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ArrowUpRight, Shield, FileText, AlertTriangle } from "lucide-react";
import { api, type Fleet } from "@/lib/api";
import { EnvironmentBadge } from "@/components/ui/environment-badge";

const envLabels: Record<string, string> = {
  dev: "Development",
  staging: "Staging",
  prod: "Production",
};

const nextEnv: Record<string, string> = {
  dev: "staging",
  staging: "prod",
};

interface PromoteFleetDialogProps {
  fleet: Fleet;
}

export function PromoteFleetDialog({ fleet }: PromoteFleetDialogProps) {
  const router = useRouter();
  const target = nextEnv[fleet.environment];
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!target) return null; // Already at prod

  const isProdPromotion = target === "prod";
  const instanceCount = fleet.instances?.length || 0;

  const canConfirm = isProdPromotion
    ? confirmText === fleet.name
    : true;

  const handlePromote = async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.promoteFleet(fleet.id, target);
      setOpen(false);
      setConfirmText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote fleet");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArrowUpRight className="w-4 h-4 mr-2" />
        Promote to {envLabels[target]}
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArrowUpRight className="w-4 h-4 mr-2" />
        Promote to {envLabels[target]}
      </Button>

      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="fixed inset-0 bg-black/50"
          onClick={() => setOpen(false)}
        />
        <div className="relative z-10 bg-background rounded-lg shadow-lg border p-6 w-full max-w-md mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Promote Fleet</h2>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Environment transition */}
            <div className="flex items-center justify-center gap-3 py-3 bg-muted/50 rounded-lg">
              <EnvironmentBadge environment={fleet.environment} />
              <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
              <EnvironmentBadge environment={target} />
            </div>

            {/* What will happen */}
            <div className="space-y-2">
              <p className="text-sm font-medium">What will happen:</p>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Fleet environment changes from <strong>{envLabels[fleet.environment]}</strong> to <strong>{envLabels[target]}</strong></span>
                </li>
                {instanceCount > 0 && (
                  <li className="flex items-start gap-2">
                    <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{instanceCount} bot{instanceCount !== 1 ? "s" : ""} will be re-reconciled with {envLabels[target].toLowerCase()} defaults</span>
                  </li>
                )}
                {(target === "staging" || target === "prod") && (
                  <li className="flex items-start gap-2">
                    <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Sandbox mode will be enforced on all bots</span>
                  </li>
                )}
                {target === "prod" && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Log level will change to warn</span>
                  </li>
                )}
              </ul>
            </div>

            {/* Prod confirmation: type fleet name */}
            {isProdPromotion && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Type <strong>{fleet.name}</strong> to confirm production promotion
                </label>
                <Input
                  placeholder={fleet.name}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePromote}
                disabled={!canConfirm || submitting}
                variant={isProdPromotion ? "destructive" : "default"}
              >
                {submitting ? "Promoting..." : `Promote to ${envLabels[target]}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
