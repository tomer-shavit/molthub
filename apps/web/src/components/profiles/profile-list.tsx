"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import type { Profile, Fleet } from "@/lib/api";
import { getFleetNames } from "./profile-utils";

interface ProfileListProps {
  profiles: Profile[];
  fleets: Fleet[];
}

function getPriorityVariant(priority: number): "success" | "default" | "secondary" {
  if (priority >= 1 && priority <= 3) return "success";
  if (priority >= 4 && priority <= 7) return "default";
  return "secondary";
}

export function ProfileList({ profiles, fleets }: ProfileListProps) {
  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Settings className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No profiles yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Profiles define shared configuration defaults for your bot instances.
        </p>
        <Link href="/profiles/new">
          <Button>Create Profile</Button>
        </Link>
      </div>
    );
  }

  const sorted = [...profiles].sort((a, b) => a.priority - b.priority);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sorted.map((profile) => (
        <Card key={profile.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{profile.name}</CardTitle>
              <Badge variant={profile.isActive ? "success" : "secondary"}>
                {profile.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {profile.description}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Priority</span>
                <Badge variant={getPriorityVariant(profile.priority)}>
                  {profile.priority}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Merge Strategy</span>
                <span className="font-medium">
                  {Object.values(profile.mergeStrategy).length > 0
                    ? Object.values(profile.mergeStrategy).join(", ")
                    : "N/A"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fleet Scope</span>
                <span className="font-medium text-right max-w-[180px] truncate">
                  {getFleetNames(profile.fleetIds, fleets)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Locked Fields</span>
                <span className="font-medium">
                  {profile.lockedFields.length}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t">
              <Link href={`/profiles/${profile.id}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  View
                </Button>
              </Link>
              <Link href={`/profiles/${profile.id}?edit=true`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  Edit
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
