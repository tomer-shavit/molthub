"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Puzzle, Search } from "lucide-react";
import type { MiddlewareRegistryEntry } from "@/lib/api";
import { MiddlewareCard } from "./middleware-card";

interface MiddlewareGalleryProps {
  middlewares: MiddlewareRegistryEntry[];
}

export function MiddlewareGallery({ middlewares }: MiddlewareGalleryProps) {
  const [search, setSearch] = useState("");

  const filtered = middlewares.filter(
    (m) =>
      m.displayName.toLowerCase().includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase()) ||
      m.hooks.some((h) => h.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      {/* Stats + Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Puzzle className="h-4 w-4" />
          <span>
            {middlewares.length} middleware{middlewares.length !== 1 ? "s" : ""}{" "}
            available
          </span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search middlewares..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((middleware) => (
            <MiddlewareCard key={middleware.id} middleware={middleware} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Puzzle className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No middlewares found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search
              ? "Try a different search term"
              : "No middlewares are available yet"}
          </p>
        </div>
      )}
    </div>
  );
}
