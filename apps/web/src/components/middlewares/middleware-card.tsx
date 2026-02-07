"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Puzzle } from "lucide-react";
import type { MiddlewareRegistryEntry } from "@/lib/api";
import { MiddlewareAssignDialog } from "./middleware-assign-dialog";
import { hookColors } from "./constants";

interface MiddlewareCardProps {
  middleware: MiddlewareRegistryEntry;
}

export function MiddlewareCard({ middleware }: MiddlewareCardProps) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {middleware.emoji ? (
                <span className="text-2xl">{middleware.emoji}</span>
              ) : (
                <Puzzle className="h-6 w-6 text-muted-foreground" />
              )}
              <CardTitle className="text-lg">{middleware.displayName}</CardTitle>
            </div>
            <Badge variant="secondary" className="shrink-0">
              v{middleware.version}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {middleware.hooks.map((hook) => (
              <Badge
                key={hook}
                variant="outline"
                className={hookColors[hook] ?? ""}
              >
                {hook}
              </Badge>
            ))}
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col justify-between gap-4">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {middleware.description}
          </p>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAssignDialogOpen(true)}>
              <Puzzle className="h-3.5 w-3.5 mr-1.5" />
              Assign to Bot
            </Button>
            <Link href={`/middlewares/${encodeURIComponent(middleware.id)}`}>
              <Button variant="ghost" size="sm">
                View Details
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <MiddlewareAssignDialog
        middleware={middleware}
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
      />
    </>
  );
}
