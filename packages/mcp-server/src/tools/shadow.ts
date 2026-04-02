/**
 * Shadow tools — 3 tools for Memory Shadow Mode.
 *
 * spawn_shadow   — Create a shadow agent from a checkpoint
 * promote_shadow — Promote shadow's state to replace the real agent
 * list_shadows   — List all shadow agents
 */

import type { CollectorClient } from '../collector-client.js';
import type {
  SpawnShadowInput,
  PromoteShadowInput,
  ListShadowsInput,
} from '../types.js';

/** Helper to produce MCP text content. */
function textContent(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

// ── spawn_shadow ────────────────────────────────────────────────

export async function handleSpawnShadow(
  client: CollectorClient,
  args: SpawnShadowInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const resp = await client.httpPost<Record<string, unknown>>('/api/shadow/spawn', {
    checkpoint_id: args.checkpoint_id,
    description: args.description,
  });

  if (resp['error']) {
    return textContent(`Failed to spawn shadow: ${resp['error']}`);
  }

  return textContent({
    success: true,
    shadow_id: resp['shadow_id'],
    parent_checkpoint_id: args.checkpoint_id,
    description: args.description,
    message: `Shadow agent spawned from checkpoint '${args.checkpoint_id}'. ` +
      `Shadow ID: '${resp['shadow_id']}'. ` +
      'The shadow runs independently without affecting the real agent. ' +
      'Use promote_shadow to replace the real agent state if the shadow result is better.',
  });
}

// ── promote_shadow ──────────────────────────────────────────────

export async function handlePromoteShadow(
  client: CollectorClient,
  args: PromoteShadowInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const resp = await client.httpPost<Record<string, unknown>>(
    `/api/shadow/${args.shadow_id}/promote`,
    {},
  );

  if (resp['error']) {
    return textContent(`Failed to promote shadow: ${resp['error']}`);
  }

  return textContent({
    success: true,
    shadow_id: args.shadow_id,
    promoted: true,
    message: `Shadow '${args.shadow_id}' has been promoted. ` +
      'Its state now replaces the real agent state.',
  });
}

// ── list_shadows ────────────────────────────────────────────────

export async function handleListShadows(
  client: CollectorClient,
  args: ListShadowsInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const params: Record<string, string> = {};
  if (args.swarm_id) params['swarm_id'] = args.swarm_id;

  const resp = await client.httpGet<{ shadows: Array<Record<string, unknown>> }>(
    '/api/shadows',
    params,
  );

  const shadows = resp.shadows ?? [];

  if (shadows.length === 0) {
    return textContent(
      'No shadow agents found. Use spawn_shadow to create one from a checkpoint.',
    );
  }

  return textContent({
    shadow_count: shadows.length,
    shadows: shadows.map((s) => ({
      shadow_id: s['shadow_id'],
      parent_checkpoint_id: s['parent_checkpoint_id'],
      parent_agent_id: s['parent_agent_id'],
      status: s['status'],
      description: s['description'],
      event_count: Array.isArray(s['events']) ? s['events'].length : 0,
      spawned_at: s['spawned_at'],
      promoted_at: s['promoted_at'],
      dismissed_at: s['dismissed_at'],
    })),
  });
}
