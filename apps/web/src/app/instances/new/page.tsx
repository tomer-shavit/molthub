import Link from 'next/link';
import { redirect } from 'next/navigation';

async function getTemplates() {
  try {
    const res = await fetch(`${process.env.API_URL || 'http://localhost:4000'}/templates`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return res.json();
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    return [];
  }
}

async function createInstance(formData: FormData) {
  'use server';
  
  const name = formData.get('name') as string;
  const environment = formData.get('environment') as string;
  const templateId = formData.get('templateId') as string;
  
  // Create instance
  const res = await fetch(`${process.env.API_URL || 'http://localhost:4000'}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      environment,
      templateId,
    }),
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error);
  }
  
  const instance = await res.json();
  
  // Create initial manifest from template
  const templateRes = await fetch(`${process.env.API_URL || 'http://localhost:4000'}/templates/${templateId}`);
  if (templateRes.ok) {
    const template = await templateRes.json();
    const manifest = {
      ...template.manifestTemplate,
      metadata: {
        ...template.manifestTemplate.metadata,
        name,
        workspace: 'default',
        environment,
      },
    };
    
    await fetch(`${process.env.API_URL || 'http://localhost:4000'}/instances/${instance.id}/manifests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: manifest }),
    });
  }
  
  redirect(`/instances/${instance.id}`);
}

export default async function CreateInstancePage() {
  const templates = await getTemplates();

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          ← Back to instances
        </Link>
        <h1 className="text-3xl font-bold">Create Instance</h1>
        <p className="text-gray-600 mt-2">Configure your new Moltbot instance</p>
      </header>

      <form action={createInstance} className="space-y-6">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">1. Choose Template</h2>
          <div className="grid grid-cols-1 gap-4">
            {templates.map((template: { id: string; name: string; description: string; category: string; isBuiltin: boolean }) => (
              <label 
                key={template.id}
                className="border rounded-lg p-4 cursor-pointer hover:border-blue-500 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <input 
                    type="radio" 
                    name="templateId" 
                    value={template.id}
                    required
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium">{template.name}</div>
                    <div className="text-sm text-gray-600">{template.description}</div>
                    <div className="text-xs text-gray-400 mt-1 capitalize">
                      {template.category} • {template.isBuiltin ? 'Built-in' : 'Custom'}
                    </div>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">2. Basic Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Instance Name
              </label>
              <input
                type="text"
                name="name"
                required
                pattern="[a-z0-9-]+"
                placeholder="my-bot"
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Environment
              </label>
              <select
                name="environment"
                required
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="dev">Development</option>
                <option value="staging">Staging</option>
                <option value="prod">Production</option>
              </select>
            </div>
          </div>
        </section>

        <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">What happens next?</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Instance record created in database</li>
            <li>Initial manifest generated from template</li>
            <li>CloudWatch log group created</li>
            <li>ECS task definition registered</li>
            <li>ECS service created and started</li>
          </ul>
        </section>

        <div className="flex gap-4">
          <Link
            href="/"
            className="px-6 py-2 border rounded hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Create Instance
          </button>
        </div>
      </form>
    </main>
  );
}