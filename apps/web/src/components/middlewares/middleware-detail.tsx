"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Puzzle } from "lucide-react";
import type { MiddlewareRegistryEntry } from "@/lib/api";
import { MiddlewareAssignDialog } from "./middleware-assign-dialog";
import { hookColors, hookDescriptions } from "./constants";

interface MiddlewareDetailProps {
  middleware: MiddlewareRegistryEntry;
}

export function MiddlewareDetail({ middleware }: MiddlewareDetailProps) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  return (
    <>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/middlewares"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Middlewares
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {middleware.emoji ? (
              <span className="text-4xl">{middleware.emoji}</span>
            ) : (
              <Puzzle className="h-10 w-10 text-muted-foreground" />
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {middleware.displayName}
              </h1>
              <p className="text-muted-foreground mt-1">
                {middleware.id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              v{middleware.version}
            </Badge>
            <Button onClick={() => setAssignDialogOpen(true)}>
              <Puzzle className="h-4 w-4 mr-2" />
              Assign to Bot
            </Button>
          </div>
        </div>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {middleware.description}
            </p>
          </CardContent>
        </Card>

        {/* Hooks */}
        <Card>
          <CardHeader>
            <CardTitle>Hooks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {middleware.hooks.map((hook) => (
                <div key={hook} className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={hookColors[hook] ?? ""}
                  >
                    {hook}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {hookDescriptions[hook] ?? "Custom hook"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Config Schema */}
        {middleware.configSchema && (
          <Card>
            <CardHeader>
              <CardTitle>Configuration Schema</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-4 rounded-md overflow-auto">
                {JSON.stringify(middleware.configSchema, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>

      <MiddlewareAssignDialog
        middleware={middleware}
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
      />
    </>
  );
}
