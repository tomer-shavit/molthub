"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DefaultsEditor } from "./defaults-editor";
import type {
  Profile,
  Fleet,
  CreateProfilePayload,
  UpdateProfilePayload,
} from "@/lib/api";

interface ProfileFormProps {
  profile?: Profile;
  fleets: Fleet[];
  workspaceId?: string;
  onSubmit: (data: CreateProfilePayload | UpdateProfilePayload) => Promise<void>;
  isLoading?: boolean;
}

export function ProfileForm({
  profile,
  fleets,
  workspaceId = "default",
  onSubmit,
  isLoading,
}: ProfileFormProps) {
  const isEdit = !!profile;

  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [priority, setPriority] = useState(profile?.priority ?? 10);
  const [allowInstanceOverrides, setAllowInstanceOverrides] = useState(
    profile?.allowInstanceOverrides ?? false
  );
  const [selectedFleetIds, setSelectedFleetIds] = useState<string[]>(
    profile?.fleetIds ?? []
  );
  const [mergeStrategy, setMergeStrategy] = useState<string>(
    getMergeStrategyDefault(profile)
  );
  const [lockedFieldsText, setLockedFieldsText] = useState(
    profile?.lockedFields?.join(", ") ?? ""
  );
  const [defaults, setDefaults] = useState<Record<string, unknown>>(
    profile?.defaults ?? {}
  );

  function getMergeStrategyDefault(p?: Profile): string {
    if (!p?.mergeStrategy) return "override";
    const values = Object.values(p.mergeStrategy);
    if (values.length > 0 && typeof values[0] === "string") {
      return values[0] as string;
    }
    return "override";
  }

  function toggleFleet(fleetId: string) {
    setSelectedFleetIds((prev) =>
      prev.includes(fleetId)
        ? prev.filter((id) => id !== fleetId)
        : [...prev, fleetId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const lockedFields = lockedFieldsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const mergeStrategyObj: Record<string, "override" | "merge" | "prepend" | "append"> = {
      "*": mergeStrategy as "override" | "merge" | "prepend" | "append",
    };

    if (isEdit) {
      const data: UpdateProfilePayload = {
        name,
        description,
        priority,
        allowInstanceOverrides,
        fleetIds: selectedFleetIds,
        mergeStrategy: mergeStrategyObj,
        lockedFields,
        defaults,
      };
      await onSubmit(data);
    } else {
      const data: CreateProfilePayload = {
        workspaceId,
        name,
        description,
        priority,
        allowInstanceOverrides,
        fleetIds: selectedFleetIds,
        mergeStrategy: mergeStrategyObj,
        lockedFields,
        defaults,
      };
      await onSubmit(data);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "Update Profile" : "Create Profile"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="profile-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Profile name"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="profile-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this profile configures"
              required
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-priority" className="text-sm font-medium">
              Priority
            </label>
            <Input
              id="profile-priority"
              type="number"
              min={1}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Lower number = higher priority. Profiles are applied in priority order.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="profile-overrides"
              type="checkbox"
              checked={allowInstanceOverrides}
              onChange={(e) => setAllowInstanceOverrides(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="profile-overrides" className="text-sm font-medium">
              Allow instance overrides
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Fleet Scope</label>
            {fleets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fleets available</p>
            ) : (
              <div className="space-y-1">
                {fleets.map((fleet) => (
                  <div key={fleet.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`fleet-${fleet.id}`}
                      checked={selectedFleetIds.includes(fleet.id)}
                      onChange={() => toggleFleet(fleet.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <label htmlFor={`fleet-${fleet.id}`} className="text-sm">
                      {fleet.name}{" "}
                      <span className="text-muted-foreground">
                        ({fleet.environment})
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-merge-strategy" className="text-sm font-medium">
              Merge Strategy
            </label>
            <select
              id="profile-merge-strategy"
              value={mergeStrategy}
              onChange={(e) => setMergeStrategy(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="override">Override</option>
              <option value="merge">Merge</option>
              <option value="prepend">Prepend</option>
              <option value="append">Append</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-locked-fields" className="text-sm font-medium">
              Locked Fields
            </label>
            <Input
              id="profile-locked-fields"
              value={lockedFieldsText}
              onChange={(e) => setLockedFieldsText(e.target.value)}
              placeholder="e.g. model, maxTokens, temperature"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of fields that instances cannot override.
            </p>
          </div>

          <DefaultsEditor value={defaults} onChange={setDefaults} />

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? isEdit
                  ? "Updating..."
                  : "Creating..."
                : isEdit
                  ? "Update Profile"
                  : "Create Profile"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
