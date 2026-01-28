import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { TimeDisplay } from '@/components/ui/time-display';
import { api, Instance } from '@/lib/api';
import { Plus } from 'lucide-react';

async function getInstances(): Promise<Instance[]> {
  try {
    const res = await fetch(`${process.env.API_URL || 'http://localhost:4000'}/instances`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return res.json();
  } catch (error) {
    console.error('Failed to fetch instances:', error);
    return [];
  }
}

export default async function InstancesPage() {
  const instances = await getInstances();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Legacy Instances</h1>
          <p className="text-muted-foreground mt-1">
            Manage legacy bot instances
          </p>
        </div>
        <Link href="/instances/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Instance
          </Button>
        </Link>
      </div>

      <div className="rounded-lg border bg-card">
        {instances.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No instances yet.</p>
            <Link href="/instances/new" className="text-primary hover:underline mt-2 inline-block">
              Create your first instance
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Reconcile</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((instance: Instance) => (
                <TableRow key={instance.id}>
                  <TableCell>
                    <Link 
                      href={`/instances/${instance.id}`}
                      className="font-medium hover:underline"
                    >
                      {instance.name}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{instance.environment}</TableCell>
                  <TableCell>
                    <StatusBadge status={instance.status} />
                  </TableCell>
                  <TableCell>
                    {instance.lastReconcileAt ? (
                      <TimeDisplay date={instance.lastReconcileAt} />
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/instances/${instance.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </DashboardLayout>
  );
}
