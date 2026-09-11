import type { AggregateKind, AggregateSnapshot, CloudAdapter, CloudProjectRef } from '../../application/ports/cloudAdapter.js';
import { CloudSyncConflictError } from '../../application/ports/cloudAdapter.js';

// docs/26_ADR/ADR-007 / docs/23_API.md §6 — the one file in this codebase allowed to know the
// wire shape of AreaFlow's own Cloud Sync API, same adapter-isolation discipline as
// adapters/betterAuth/authAdapter.ts. UI/Application never see fetch/URLs/HTTP status codes —
// only the CloudAdapter port and its typed CloudSyncConflictError.
//
// `credentials: 'include'` on every call — auth is the Better Auth session cookie
// (BetterAuthAdapter sets it on sign-in), not a bearer token this adapter carries itself; a
// signed-out caller simply gets 401s, which surface as a generic Error (there is no "not signed
// in" case in this port's contract — the UI layer is expected to check AuthAdapter's session
// before ever calling a "Save to account" action that reaches this adapter, same as it already
// does for the AccountMenu itself).

const baseUrl = import.meta.env.VITE_AUTH_API_URL ?? 'http://localhost:8787';

function projectUrl(projectId: string): string {
  return `${baseUrl}/v1/projects/${encodeURIComponent(projectId)}`;
}

function surfaceUrl(projectId: string, surfaceId: string): string {
  return `${projectUrl(projectId)}/surfaces/${encodeURIComponent(surfaceId)}`;
}

async function parseConflict(response: Response): Promise<never> {
  const body = (await response.json()) as { serverVersion: number; serverSnapshot: AggregateSnapshot };
  throw new CloudSyncConflictError(body.serverVersion, body.serverSnapshot);
}

export class HttpCloudAdapter implements CloudAdapter {
  async push(snapshot: AggregateSnapshot): Promise<void> {
    const url = snapshot.kind === 'project' ? projectUrl(snapshot.aggregateId) : surfaceUrl(snapshot.parentId ?? '', snapshot.aggregateId);
    const method = snapshot.kind === 'project' ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: snapshot.version, data: snapshot.data }),
    });

    if (response.status === 409) return parseConflict(response);
    if (!response.ok) throw new Error(`CloudAdapter.push failed: ${response.status} ${response.statusText}`);
  }

  async pull(kind: AggregateKind, aggregateId: string, sinceVersion: number, parentId?: string): Promise<AggregateSnapshot | null> {
    const url = kind === 'project' ? projectUrl(aggregateId) : surfaceUrl(parentId ?? '', aggregateId);
    const response = await fetch(`${url}?since=${sinceVersion}`, { credentials: 'include' });

    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`CloudAdapter.pull failed: ${response.status} ${response.statusText}`);
    const body = (await response.json()) as { snapshot: AggregateSnapshot };
    return body.snapshot;
  }

  async listOwnedProjects(): Promise<readonly CloudProjectRef[]> {
    const response = await fetch(`${baseUrl}/v1/projects`, { credentials: 'include' });
    if (!response.ok) throw new Error(`CloudAdapter.listOwnedProjects failed: ${response.status} ${response.statusText}`);
    const body = (await response.json()) as { projects: CloudProjectRef[] };
    return body.projects;
  }
}
