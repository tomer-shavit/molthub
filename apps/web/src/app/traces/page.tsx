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
import { TimeDisplay, DurationDisplay } from "@/components/ui/time-display";
import { api, type Trace } from "@/lib/api";
import Link from "next/link";
import { Search, Filter, Clock, CheckCircle, XCircle, Activity } from "lucide-react";

async function getTraces(searchParams: { [key: string]: string | undefined }): Promise<Trace[]> {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    return await api.listTraces({
      botInstanceId: searchParams.botInstanceId,
      type: searchParams.type,
      status: searchParams.status,
      from,
      to,
      limit: 100,
    });
  } catch (error) {
    console.error("Failed to fetch traces:", error);
    return [];
  }
}

export default async function TracesPage({ 
  searchParams 
}: { 
  searchParams: { [key: string]: string | undefined } 
}) {
  const traces = await getTraces(searchParams);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trace Viewer</h1>
          <p className="text-muted-foreground mt-1">
            End-to-end message trace visualization
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
                  placeholder="Search traces..."
                  className="pl-8"
                />
              </div>
            </div>
            <div className="w-[150px]">
              <Select defaultValue={searchParams.status || "all"}>
                <option value="all">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="ERROR">Error</option>
                <option value="PENDING">Pending</option>
              </Select>
            </div>
            <div className="w-[150px]">
              <Select defaultValue={searchParams.type || "all"}>
                <option value="all">All Types</option>
                <option value="REQUEST">Request</option>
                <option value="TASK">Task</option>
                <option value="SKILL">Skill</option>
                <option value="TOOL">Tool</option>
                <option value="MODEL">Model</option>
              </Select>
            </div>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Traces Table */}
      <Card>
        <CardHeader>
          <CardTitle>Traces</CardTitle>
          <CardDescription>{traces.length} traces found</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trace ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Started</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {traces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No traces found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                traces.map((trace) => (
                  <TableRow key={trace.id}>
                    <TableCell className="font-mono text-xs">
                      {trace.traceId.slice(0, 20)}...
                    </TableCell>
                    <TableCell className="font-medium">{trace.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-secondary">
                        <Activity className="w-3 h-3" />
                        {trace.type}
                      </span>
                    </TableCell>
                    <TableCell>
                      {trace.botInstance ? (
                        <Link 
                          href={`/bots/${trace.botInstance.id}`}
                          className="hover:underline text-sm"
                        >
                          {trace.botInstance.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {trace.status === 'SUCCESS' ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          Success
                        </span>
                      ) : trace.status === 'ERROR' ? (
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircle className="w-4 h-4" />
                          Error
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-yellow-600">
                          <Clock className="w-4 h-4" />
                          Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {trace.durationMs ? <DurationDisplay ms={trace.durationMs} /> : "-"}
                    </TableCell>
                    <TableCell>
                      <TimeDisplay date={trace.startedAt} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/traces/${trace.traceId}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
