"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select-radix";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Puzzle, AlertCircle, CheckCircle2, Bot } from "lucide-react";
import { botInstancesClient, middlewaresClient } from "@/lib/api";
import type { MiddlewareRegistryEntry, BotInstance } from "@/lib/api";

interface MiddlewareAssignDialogProps {
  middleware: MiddlewareRegistryEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MiddlewareAssignDialog({
  middleware,
  open,
  onOpenChange,
}: MiddlewareAssignDialogProps) {
  const router = useRouter();
  const [instances, setInstances] = useState<BotInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setLoadingInstances(true);
      setError(null);
      setSuccess(false);
      setSelectedInstance("");
      botInstancesClient
        .list()
        .then((data) => {
          const running = data.filter((i) => i.status === "RUNNING");
          setInstances(running);
          if (running.length === 1) {
            setSelectedInstance(running[0].id);
          }
        })
        .catch((e) => {
          setError(`Failed to load bot instances: ${e.message}`);
        })
        .finally(() => {
          setLoadingInstances(false);
        });
    }
  }, [open]);

  const handleAssign = async () => {
    if (!selectedInstance) {
      setError("Please select a bot instance");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await middlewaresClient.assignToBot(selectedInstance, {
        package: middleware.id,
        enabled: true,
      });
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        router.push(`/bots/${selectedInstance}`);
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Assign Middleware: {middleware.displayName}
          </DialogTitle>
          <DialogDescription>
            Assign this middleware to a running bot instance. The middleware will
            intercept traffic based on its configured hooks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="instance">Target Bot Instance</Label>
            {loadingInstances ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading instances...
              </div>
            ) : instances.length === 0 ? (
              <Alert>
                <Bot className="h-4 w-4" />
                <AlertDescription>
                  No running bot instances found. Deploy a bot first to assign
                  middlewares.
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={selectedInstance}
                onValueChange={setSelectedInstance}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a bot instance" />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Middleware assigned successfully! Redirecting to bot details...
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={loading || !selectedInstance || success}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {success ? "Assigned!" : "Assign Middleware"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
