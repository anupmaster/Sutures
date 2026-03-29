/**
 * Checkpoint Store — SQLite-backed persistent checkpoint storage.
 *
 * Uses better-sqlite3 for synchronous operations (non-blocking at our scale).
 * Stores serialized agent state snapshots for replay and intervention.
 */

import Database from 'better-sqlite3';
import type { Checkpoint } from './schemas.js';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    swarm_id TEXT NOT NULL,
    state BLOB NOT NULL,
    memory_hierarchy BLOB,
    parent_checkpoint_id TEXT,
    created_at TEXT NOT NULL
  )
`;

const CREATE_INDEX_THREAD = `
  CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_id ON checkpoints(thread_id)
`;

const CREATE_INDEX_AGENT = `
  CREATE INDEX IF NOT EXISTS idx_checkpoints_agent_id ON checkpoints(agent_id)
`;

export class CheckpointStore {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.init();
  }

  /** Initialize the database schema. */
  private init(): void {
    try {
      this.db.pragma('journal_mode = WAL');
      this.db.exec(CREATE_TABLE);
      this.db.exec(CREATE_INDEX_THREAD);
      this.db.exec(CREATE_INDEX_AGENT);
    } catch (err) {
      console.error('[CheckpointStore] Failed to initialize database:', err);
      throw err;
    }
  }

  /** Save a checkpoint. */
  save(checkpoint: Checkpoint): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO checkpoints
          (checkpoint_id, thread_id, agent_id, swarm_id, state, memory_hierarchy, parent_checkpoint_id, created_at)
        VALUES
          (@checkpoint_id, @thread_id, @agent_id, @swarm_id, @state, @memory_hierarchy, @parent_checkpoint_id, @created_at)
      `);
      stmt.run({
        checkpoint_id: checkpoint.checkpoint_id,
        thread_id: checkpoint.thread_id,
        agent_id: checkpoint.agent_id,
        swarm_id: checkpoint.swarm_id,
        state: JSON.stringify(checkpoint.state),
        memory_hierarchy: checkpoint.memory_hierarchy != null
          ? JSON.stringify(checkpoint.memory_hierarchy)
          : null,
        parent_checkpoint_id: checkpoint.parent_checkpoint_id ?? null,
        created_at: checkpoint.created_at,
      });
    } catch (err) {
      console.error('[CheckpointStore] Failed to save checkpoint:', err);
      throw err;
    }
  }

  /** Retrieve a checkpoint by its ID. */
  getById(checkpointId: string): Checkpoint | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM checkpoints WHERE checkpoint_id = ?');
      const row = stmt.get(checkpointId) as CheckpointRow | undefined;
      return row ? this.rowToCheckpoint(row) : null;
    } catch (err) {
      console.error('[CheckpointStore] Failed to get checkpoint:', err);
      return null;
    }
  }

  /** Retrieve all checkpoints for a thread, ordered by created_at ascending. */
  getByThreadId(threadId: string): Checkpoint[] {
    try {
      const stmt = this.db.prepare(
        'SELECT * FROM checkpoints WHERE thread_id = ? ORDER BY created_at ASC'
      );
      const rows = stmt.all(threadId) as CheckpointRow[];
      return rows.map((r) => this.rowToCheckpoint(r));
    } catch (err) {
      console.error('[CheckpointStore] Failed to get checkpoints by thread:', err);
      return [];
    }
  }

  /** Get the checkpoint chain history — walk parent_checkpoint_id links. */
  getHistory(threadId: string): Checkpoint[] {
    try {
      const checkpoints = this.getByThreadId(threadId);
      // Build a lookup for efficient chain walking
      const byId = new Map<string, Checkpoint>();
      for (const cp of checkpoints) {
        byId.set(cp.checkpoint_id, cp);
      }
      // Find the latest checkpoint (last in time)
      if (checkpoints.length === 0) return [];
      let current: Checkpoint | undefined = checkpoints[checkpoints.length - 1];
      const chain: Checkpoint[] = [];
      const visited = new Set<string>();
      while (current && !visited.has(current.checkpoint_id)) {
        visited.add(current.checkpoint_id);
        chain.unshift(current);
        if (current.parent_checkpoint_id) {
          current = byId.get(current.parent_checkpoint_id);
        } else {
          break;
        }
      }
      return chain;
    } catch (err) {
      console.error('[CheckpointStore] Failed to get checkpoint history:', err);
      return [];
    }
  }

  /** Delete a checkpoint by its ID. */
  delete(checkpointId: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM checkpoints WHERE checkpoint_id = ?');
      const result = stmt.run(checkpointId);
      return result.changes > 0;
    } catch (err) {
      console.error('[CheckpointStore] Failed to delete checkpoint:', err);
      return false;
    }
  }

  /** Close the database connection. */
  close(): void {
    try {
      this.db.close();
    } catch (err) {
      console.error('[CheckpointStore] Failed to close database:', err);
    }
  }

  private rowToCheckpoint(row: CheckpointRow): Checkpoint {
    return {
      checkpoint_id: row.checkpoint_id,
      thread_id: row.thread_id,
      agent_id: row.agent_id,
      swarm_id: row.swarm_id,
      state: JSON.parse(row.state as string),
      memory_hierarchy: row.memory_hierarchy != null
        ? JSON.parse(row.memory_hierarchy as string)
        : undefined,
      parent_checkpoint_id: row.parent_checkpoint_id ?? undefined,
      created_at: row.created_at,
    };
  }
}

interface CheckpointRow {
  checkpoint_id: string;
  thread_id: string;
  agent_id: string;
  swarm_id: string;
  state: string | Buffer;
  memory_hierarchy: string | Buffer | null;
  parent_checkpoint_id: string | null;
  created_at: string;
}
