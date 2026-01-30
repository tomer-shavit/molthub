"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import type { Profile, Fleet, UpdateProfilePayload, CreateProfilePayload } from "@/lib/api";
import { getFleetNames } from "./profile-utils";

interface ProfileDetailProps {
  profile: Profile;
  fleets: Fleet[];
  onDelete?: () => void;
  onUpdate?: (data: UpdateProfilePayload) => Promise<void>;
}

export function ProfileDetail({
  profile,
  fleets,
  onDelete,
  onUpdate,
}: ProfileDetailProps) {
  const searchParams = useSearchParams();
  const [isEditing, setIsEditing] = useState(searchParams.get("edit") === "true");

  function handleDelete() {
    if (window.confirm(`Are you sure you want to delete profile "${profile.name}"?`)) {
      onDelete?.();
    }
  }

  async function handleUpdate(data: CreateProfilePayload | UpdateProfilePayload) {
    if (onUpdate) {
      await onUpdate(data as UpdateProfilePayload);
      setIsEditing(false);
    }
  }

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            Cancel Edit
          </Button>
          <Link href="/profiles">
            <Button variant="outline" size="sm">
              Back to Profiles
            </Button>
          </Link>
        </div>
        <ProfileForm
          profile={profile}
          fleets={fleets}
          onSubmit={handleUpdate}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/profiles">
          <Button variant="outline" size="sm">
            Back to Profiles
          </Button>
        </Link>
        <Button size="sm" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
        {onDelete && (
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            Delete
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{profile.name}</CardTitle>
            <Badge variant={profile.isActive ? "success" : "secondary"}>
              {profile.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{profile.description}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Priority</span>
              <span className="font-medium">{profile.priority}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Merge Strategy</span>
              <span className="font-medium">
                {Object.entries(profile.mergeStrategy)
                  .map(([key, val]) => `${key}: ${val}`)
                  .join(", ") || "N/A"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Fleet Scope</span>
              <span className="font-medium">
                {getFleetNames(profile.fleetIds, fleets)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Allow Instance Overrides</span>
              <span className="font-medium">
                {profile.allowInstanceOverrides ? "Yes" : "No"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Locked Fields</span>
              <span className="font-medium">
                {profile.lockedFields.length > 0
                  ? profile.lockedFields.join(", ")
                  : "None"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created By</span>
              <span className="font-medium">{profile.createdBy}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">
                {new Date(profile.createdAt).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span className="font-medium">
                {new Date(profile.updatedAt).toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-4 text-sm font-mono overflow-auto max-h-[400px]">
            {JSON.stringify(profile.defaults, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
