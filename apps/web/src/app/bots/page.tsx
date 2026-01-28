import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type BotInstance } from "@/lib/api";
import { StatusBadge, HealthIndicator } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { TimeDisplay } from "@/components/ui/time-display";
import Link from "next/link";
import { Bot, ArrowRight } from "lucide-react";

async function getBots(): Promise<BotInstance[]> {
  try {
    return await api.listBotInstances();
  } catch (error) {
    return [];
  }
}

export default async function BotsPage() {
  const bots = await getBots();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bot Instances</h1>
          <p className="text-muted-foreground mt-1">
            Manage your bot instances
          </p>
        </div>
        <Button>
          <Bot className="w-4 h-4 mr-2" />
          New Bot
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Bot Instances</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Uptime</TableHead>
                <TableHead>Last Health Check</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No bot instances found.
                  </TableCell>
                </TableRow>
              ) : (
                bots.map((bot) => (
                  <TableRow key={bot.id}>
                    <TableCell className="font-medium">{bot.name}</TableCell>
                    <TableCell><StatusBadge status={bot.status} /></TableCell>
                    <TableCell><HealthIndicator health={bot.health} /></TableCell>
                    <TableCell>
                      {Math.floor(bot.uptimeSeconds / 3600)}h {Math.floor((bot.uptimeSeconds % 3600) / 60)}m
                    </TableCell>
                    <TableCell>
                      {bot.lastHealthCheckAt ? (
                        <TimeDisplay date={bot.lastHealthCheckAt} />
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/bots/${bot.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
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
