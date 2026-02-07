export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { TimeDisplay } from "@/components/ui/time-display";
import { api, type AuditEvent } from "@/lib/api";
import Link from "next/link";
import { Search, Filter, History, User, FileText, ArrowRight, GitCommit, RotateCcw } from "lucide-react";

async function getAuditEvents(searchParams: { [key: string]: string | undefined }): Promise<AuditEvent[]> {
  try {
    return await api.listAuditEvents({
      instanceId: searchParams.instanceId,
      actor: searchParams.actor,
      from: searchParams.from,
      to: searchParams.to,
    });
  } catch (error) {
    console.error("Failed to fetch audit events:", error);
    return [];
  }
}

function getEventIcon(action: string) {
  if (action.includes('CREATE')) return <GitCommit className="w-4 h-4 text-blue-500" />;
  if (action.includes('UPDATE')) return <FileText className="w-4 h-4 text-yellow-500" />;
  if (action.includes('DELETE')) return <FileText className="w-4 h-4 text-red-500" />;
  if (action.includes('ROLLBACK')) return <RotateCcw className="w-4 h-4 text-orange-500" />;
  return <History className="w-4 h-4 text-muted-foreground" />;
}

export default async function AuditPage({ 
  searchParams 
}: { 
  searchParams: { [key: string]: string | undefined } 
}) {
  const events = await getAuditEvents(searchParams);

  // Group events by date
  const groupedEvents = events.reduce((groups, event) => {
    const date = new Date(event.timestamp).toLocaleDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(event);
    return groups;
  }, {} as Record<string, AuditEvent[]>);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground mt-1">
            Track all changes and actions across your infrastructure
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  className="pl-8"
                />
              </div>
            </div>
            <div className="w-[150px]">
              <Select defaultValue={searchParams.resourceType || "all"}>
                <option value="all">All Resources</option>
                <option value="INSTANCE">Instance</option>
                <option value="FLEET">Fleet</option>
                <option value="PROFILE">Profile</option>
                <option value="POLICY">Policy</option>
              </Select>
            </div>
            <div className="w-[150px]">
              <Select defaultValue={searchParams.actor || "all"}>
                <option value="all">All Actors</option>
                <option value="system">System</option>
              </Select>
            </div>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Event Timeline</CardTitle>
          <CardDescription>{events.length} events found</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedEvents).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No audit events found.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedEvents).map(([date, dateEvents]) => (
                <div key={date}>
                  <div className="sticky top-0 bg-card z-10 pb-2 mb-4 border-b">
                    <h3 className="font-semibold text-lg">{date}</h3>
                  </div>
                  <div className="space-y-4">
                    {dateEvents.map((event) => (
                      <div key={event.id} className="flex items-start gap-4 p-4 rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="mt-1 p-2 bg-muted rounded-full">
                          {getEventIcon(event.action)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{event.action}</span>
                            <span className="text-muted-foreground">on</span>
                            <span className="px-2 py-0.5 bg-secondary rounded text-xs font-medium">
                              {event.resourceType}
                            </span>
                            <Link 
                              href={`/${event.resourceType.toLowerCase()}s/${event.resourceId}`}
                              className="font-mono text-sm text-primary hover:underline"
                            >
                              {event.resourceId.slice(0, 12)}...
                            </Link>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {event.actor}
                            </span>
                            <span className="flex items-center gap-1">
                              <History className="w-3 h-3" />
                              <TimeDisplay date={event.timestamp} format="absolute" />
                            </span>
                          </div>
                          {event.diffSummary && (
                            <div className="mt-3 p-3 bg-muted rounded text-sm">
                              {event.diffSummary}
                            </div>
                          )}
                          {event.metadata && Object.keys(event.metadata).length > 0 && (
                            <details className="mt-2">
                              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                View metadata
                              </summary>
                              <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto">
                                {JSON.stringify(event.metadata, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                        <Link href={`/${event.resourceType.toLowerCase()}s/${event.resourceId}`}>
                          <Button variant="ghost" size="sm">
                            View
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
