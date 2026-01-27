const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface Instance {
  id: string;
  workspaceId: string;
  name: string;
  environment: 'dev' | 'staging' | 'prod';
  tags: Record<string, string>;
  status: 'CREATING' | 'RUNNING' | 'DEGRADED' | 'STOPPED' | 'DELETING' | 'ERROR';
  desiredManifestId?: string;
  lastReconcileAt?: string;
  lastError?: string;
  ecsServiceArn?: string;
  cloudwatchLogGroup?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  manifestTemplate: Record<string, unknown>;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManifestVersion {
  id: string;
  instanceId: string;
  version: number;
  content: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  diffSummary?: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

class ApiClient {
  private async fetch(path: string, options?: RequestInit) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Instances
  async listInstances(): Promise<Instance[]> {
    return this.fetch('/instances');
  }

  async getInstance(id: string): Promise<Instance> {
    return this.fetch(`/instances/${id}`);
  }

  async createInstance(data: {
    name: string;
    environment: string;
    templateId: string;
    tags?: Record<string, string>;
  }): Promise<Instance> {
    return this.fetch('/instances', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async restartInstance(id: string): Promise<void> {
    await this.fetch(`/instances/${id}/actions/restart`, { method: 'POST' });
  }

  async stopInstance(id: string): Promise<void> {
    await this.fetch(`/instances/${id}/actions/stop`, { method: 'POST' });
  }

  async deleteInstance(id: string): Promise<void> {
    await this.fetch(`/instances/${id}`, { method: 'DELETE' });
  }

  // Manifests
  async listManifests(instanceId: string): Promise<ManifestVersion[]> {
    return this.fetch(`/instances/${instanceId}/manifests`);
  }

  async createManifest(
    instanceId: string,
    data: { content: Record<string, unknown>; description?: string }
  ): Promise<ManifestVersion> {
    return this.fetch(`/instances/${instanceId}/manifests`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async triggerReconcile(instanceId: string): Promise<void> {
    await this.fetch(`/instances/${instanceId}/manifests/reconcile`, { method: 'POST' });
  }

  // Templates
  async listTemplates(): Promise<Template[]> {
    return this.fetch('/templates');
  }

  async getTemplate(id: string): Promise<Template> {
    return this.fetch(`/templates/${id}`);
  }

  // Audit
  async listAuditEvents(params?: {
    instanceId?: string;
    actor?: string;
    from?: string;
    to?: string;
  }): Promise<AuditEvent[]> {
    const searchParams = new URLSearchParams();
    if (params?.instanceId) searchParams.set('instanceId', params.instanceId);
    if (params?.actor) searchParams.set('actor', params.actor);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);

    return this.fetch(`/audit?${searchParams}`);
  }

  // Health
  async checkHealth(): Promise<{ status: string; checks: Record<string, unknown> }> {
    return this.fetch('/health');
  }

  // Metrics
  async getMetrics(): Promise<string> {
    const response = await fetch(`${API_URL}/metrics`);
    return response.text();
  }
}

export const api = new ApiClient();