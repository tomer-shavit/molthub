"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimeDisplay, DurationDisplay } from "@/components/ui/time-display";
import { Progress } from "@/components/ui/progress";
import { api, type Trace } from "@/lib/api";
import Link from "next/link";
import { 
  ArrowLeft, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Activity,
  ChevronRight,
  ChevronDown,
  Copy,
  FileJson
} from "lucide-react";

interface TraceTreeNodeProps {
  trace: Trace & { children?: Trace[] };
  level?: number;
  totalDuration: number;
}

function TraceTreeNode({ trace, level = 0, totalDuration }: TraceTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = trace.children && trace.children.length > 0;
  const percentage = totalDuration > 0 && trace.durationMs 
    ? (trace.durationMs / totalDuration) * 100 
    : 0;

  return (
    <div className="select-none">
      <div 
        className="flex items-center gap-2 py-2 hover:bg-accent/50 rounded px-2 cursor-pointer"
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> 
                 : <ChevronRight className="w-4 h-4 text-muted-foreground" />
        ) : (
          <span className="w-4" />
        )}
        
        {trace.status === 'SUCCESS' ? (
          <CheckCircle className="w-4 h-4 text-green-500" />
        ) : trace.status === 'ERROR' ? (
          <XCircle className="w-4 h-4 text-red-500" />
        ) : (
          <Clock className="w-4 h-4 text-yellow-500" />
        )}
        
        <span className="text-sm font-medium">{trace.name}</span>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-secondary">
          {trace.type}
        </span>
        
        <div className="flex-1" />
        
        {trace.durationMs && (
          <DurationDisplay ms={trace.durationMs} />
        )}
      </div>
      
      {percentage > 0 && (
        <div style={{ paddingLeft: `${level * 20 + 28}px` }} className="mb-1">
          <div className="flex items-center gap-2">
            <Progress value={percentage} className="h-1 flex-1" />
            <span className="text-xs text-muted-foreground w-10 text-right">
              {percentage.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
      
      {expanded && hasChildren && (
        <div>
          {trace.children!.map((child) => (
            <TraceTreeNode 
              key={child.id} 
              trace={child} 
              level={level + 1}
              totalDuration={totalDuration}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TraceDetailPage({ params }: { params: { id: string } }) {
  const [trace, setTrace] = useState<(Trace & { children?: Trace[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTrace() {
      try {
        const data = await api.getTraceTree(params.id);
        setTrace(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trace");
      } finally {
        setLoading(false);
      }
    }
    loadTrace();
  }, [params.id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !trace) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <XCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold">Trace not found</h2>
          <p className="text-muted-foreground mt-2">{error || "The trace could not be loaded"}</p>
          <Link href="/traces">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Traces
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const totalDuration = trace.durationMs || 0;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6">
        <Link 
          href="/traces" 
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Traces
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{trace.name}</h1>
            <p className="text-muted-foreground mt-1">
              Trace ID: <code className="bg-muted px-1 rounded">{trace.traceId}</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Copy className="w-4 h-4 mr-2" />
              Copy ID
            </Button>
            <Button variant="outline" size="sm">
              <FileJson className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
          </CardHeader>
          <CardContent>
            {trace.status === 'SUCCESS' ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Success</span>
              </div>
            ) : trace.status === 'ERROR' ? (
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="w-5 h-5" />
                <span className="font-semibold">Error</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-600">
                <Clock className="w-5 h-5" />
                <span className="font-semibold">Pending</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Duration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <span className="font-semibold">
                {trace.durationMs ? <DurationDisplay ms={trace.durationMs} /> : "-"}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-muted-foreground" />
              <span className="font-semibold">{trace.type}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Started</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeDisplay date={trace.startedAt} format="absolute" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tree" className="w-full">
        <TabsList>
          <TabsTrigger active>Trace Tree</TabsTrigger>
          <TabsTrigger>Input</TabsTrigger>
          <TabsTrigger>Output</TabsTrigger>
          <TabsTrigger>Metadata</TabsTrigger>
        </TabsList>

        <TabsContent active className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Execution Trace Tree</CardTitle>
              <CardDescription>End-to-end execution flow with latency breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <TraceTreeNode trace={trace} totalDuration={totalDuration} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
              <CardDescription>Request input parameters</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                {JSON.stringify(trace.input, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Output</CardTitle>
              <CardDescription>Response output data</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                {JSON.stringify(trace.output, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
              <CardDescription>Additional trace metadata and tags</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Metadata</h4>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                    {JSON.stringify(trace.metadata, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Tags</h4>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                    {JSON.stringify(trace.tags, null, 2)}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Error Display */}
      {trace.error && (
        <Card className="mt-8 border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Error Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-red-700 text-sm whitespace-pre-wrap">
              {JSON.stringify(trace.error, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
