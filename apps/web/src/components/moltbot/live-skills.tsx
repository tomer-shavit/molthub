"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Puzzle, Server, Plus, Minus, Check } from "lucide-react";

interface LiveSkillsProps {
  deployedSkills: string[];
  liveSkills: string[];
  deployedMcpServers: string[];
  liveMcpServers: string[];
  className?: string;
}

export function LiveSkills({
  deployedSkills,
  liveSkills,
  deployedMcpServers,
  liveMcpServers,
  className,
}: LiveSkillsProps) {
  const deployedSet = new Set(deployedSkills);
  const liveSet = new Set(liveSkills);
  const deployedMcpSet = new Set(deployedMcpServers);
  const liveMcpSet = new Set(liveMcpServers);

  // All unique skills across both
  const allSkills = [...new Set([...deployedSkills, ...liveSkills])].sort();
  const allMcpServers = [...new Set([...deployedMcpServers, ...liveMcpServers])].sort();

  const getSkillStatus = (skill: string) => {
    const inDeployed = deployedSet.has(skill);
    const inLive = liveSet.has(skill);
    if (inDeployed && inLive) return "unchanged";
    if (!inDeployed && inLive) return "added";
    if (inDeployed && !inLive) return "removed";
    return "unchanged";
  };

  const getMcpStatus = (server: string) => {
    const inDeployed = deployedMcpSet.has(server);
    const inLive = liveMcpSet.has(server);
    if (inDeployed && inLive) return "unchanged";
    if (!inDeployed && inLive) return "added";
    if (inDeployed && !inLive) return "removed";
    return "unchanged";
  };

  const hasSkillChanges = allSkills.some((s) => getSkillStatus(s) !== "unchanged");
  const hasMcpChanges = allMcpServers.some((s) => getMcpStatus(s) !== "unchanged");

  return (
    <div className={`space-y-4 ${className || ""}`}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Puzzle className="w-4 h-4" />
            Skills
            {hasSkillChanges && (
              <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 text-xs ml-auto">
                Changed
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allSkills.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No skills configured
            </p>
          ) : (
            <div className="space-y-2">
              {allSkills.map((skill) => {
                const status = getSkillStatus(skill);
                return (
                  <div
                    key={skill}
                    className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                      status === "added"
                        ? "bg-green-50 border border-green-200"
                        : status === "removed"
                          ? "bg-red-50 border border-red-200 opacity-70"
                          : "bg-muted"
                    }`}
                  >
                    <span className={status === "removed" ? "line-through text-red-600" : ""}>
                      {skill}
                    </span>
                    <div>
                      {status === "added" && (
                        <Badge className="bg-green-100 text-green-700 border-green-300 text-xs gap-1">
                          <Plus className="w-3 h-3" /> Runtime
                        </Badge>
                      )}
                      {status === "removed" && (
                        <Badge className="bg-red-100 text-red-700 border-red-300 text-xs gap-1">
                          <Minus className="w-3 h-3" /> Removed
                        </Badge>
                      )}
                      {status === "unchanged" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="w-4 h-4" />
            MCP Servers
            {hasMcpChanges && (
              <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 text-xs ml-auto">
                Changed
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allMcpServers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No MCP servers connected
            </p>
          ) : (
            <div className="space-y-2">
              {allMcpServers.map((server) => {
                const status = getMcpStatus(server);
                return (
                  <div
                    key={server}
                    className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                      status === "added"
                        ? "bg-green-50 border border-green-200"
                        : status === "removed"
                          ? "bg-red-50 border border-red-200 opacity-70"
                          : "bg-muted"
                    }`}
                  >
                    <span className={status === "removed" ? "line-through text-red-600" : ""}>
                      {server}
                    </span>
                    <div>
                      {status === "added" && (
                        <Badge className="bg-green-100 text-green-700 border-green-300 text-xs gap-1">
                          <Plus className="w-3 h-3" /> Runtime
                        </Badge>
                      )}
                      {status === "removed" && (
                        <Badge className="bg-red-100 text-red-700 border-red-300 text-xs gap-1">
                          <Minus className="w-3 h-3" /> Removed
                        </Badge>
                      )}
                      {status === "unchanged" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
