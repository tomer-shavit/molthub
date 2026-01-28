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
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { TimeDisplay } from "@/components/ui/time-display";
import { api, type ChangeSet } from "@/lib/api";
import Link from "next/link";
import { Search, Filter, FileText, GitCommit, ArrowRight } from "lucide-react";

async function getChangeSets(searchParams: { [key: string]: string | undefined }): Promise<ChangeSet[]> {
  try {
    return await api.listChangeSets({
      botInstanceId: searchParams.botInstanceId,
      status: searchParams.status,
    });
  } catch (error) {
    console.error("Failed to fetch change sets:", error);
    return [];
  }
}

export default async function ChangeSetsPage({ 
  searchParams 
}: { 
  searchParams: { [key: string]: string | undefined } 
}) {
  const changeSets = await getChangeSets(searchParams);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Change Sets</h1>
          <p className="text-muted-foreground mt-1">
            Configuration changes and rollouts
          </p>
        </div>
        <Button>
          <GitCommit className="w-4 h-4 mr-2" />
          New Change Set
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search change sets..."
                  className="pl-8"
                />
              </div>
            </div>
            <div className="w-[150px]">
              <Select defaultValue={searchParams.status || "all"}>
                <option value="all">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
                <option value="ROLLED_BACK">Rolled Back</option>
              </Select>
            </div>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Sets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Change Sets</CardTitle>
          <CardDescription>{changeSets.length} change sets found</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changeSets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No change sets found.
                  </TableCell>
                </TableRow>
              ) : (
                changeSets.map((cs) => {
                  const progress = cs.totalInstances > 0 
                    ? Math.round(((cs.updatedInstances + cs.failedInstances) / cs.totalInstances) * 100)
                    : 0;
                  
                  return (
                    <TableRow key={cs.id}>
                      <TableCell className="font-mono text-xs">
                        {cs.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        {cs.botInstance ? (
                          <Link 
                            href={`/bots/${cs.botInstance.id}`}
                            className="hover:underline text-sm"
                          >
                            {cs.botInstance.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{cs.changeType.toLowerCase()}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {cs.description}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={cs.status} />
                      </TableCell>
                      <TableCell>
                        <div className="w-[100px]">
                          <Progress value={progress} className="h-2" />
                          <span className="text-xs text-muted-foreground">
                            {cs.updatedInstances + cs.failedInstances}/{cs.totalInstances}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">
                        {cs.rolloutStrategy.toLowerCase()}
                        {cs.rolloutPercentage && ` (${cs.rolloutPercentage}%)`}
                      </TableCell>
                      <TableCell>
                        <TimeDisplay date={cs.createdAt} />
                      </TableCell>
                      <TableCell>
                        <Link href={`/changesets/${cs.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
