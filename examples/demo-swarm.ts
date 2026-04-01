/**
 * Sutures Demo — Simulated 3-Agent Research Swarm
 *
 * This script simulates a multi-agent system sending real events
 * to the Sutures collector so you can see the dashboard in action.
 *
 * Usage:
 *   npx tsx examples/demo-swarm.ts
 *
 * Prerequisites:
 *   - Collector running on ws://localhost:9470
 *   - Dashboard running on http://localhost:9472
 */

import { SuturesClient } from '../packages/core/src/index.js';

const SWARM_ID = crypto.randomUUID();

// Create 3 agent clients
const researcher = new SuturesClient({
  swarm_id: SWARM_ID,
  agent_id: 'agent-researcher',
});

const critic = new SuturesClient({
  swarm_id: SWARM_ID,
  agent_id: 'agent-critic',
});

const writer = new SuturesClient({
  swarm_id: SWARM_ID,
  agent_id: 'agent-writer',
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('🧵 Sutures Demo Swarm');
  console.log(`   Swarm ID: ${SWARM_ID}`);
  console.log('   Connecting to collector...\n');

  // Connect all agents
  researcher.connect();
  critic.connect();
  writer.connect();

  await sleep(1000); // wait for WS connections

  // --- Phase 1: Spawn agents ---
  console.log('📍 Spawning agents...');

  researcher.agentSpawned({
    name: 'Researcher',
    role: 'research',
    model: 'claude-sonnet-4-20250514',
    tools: ['web_search', 'arxiv_search', 'read_paper'],
    system_prompt_hash: 'sha256:abc123',
  });

  await sleep(500);

  critic.agentSpawned({
    name: 'Critic',
    role: 'critique',
    model: 'claude-sonnet-4-20250514',
    tools: ['evaluate', 'score'],
    system_prompt_hash: 'sha256:def456',
  });

  await sleep(500);

  writer.agentSpawned({
    name: 'Writer',
    role: 'writing',
    model: 'claude-opus-4-20250514',
    tools: ['write_document', 'format_markdown'],
    system_prompt_hash: 'sha256:ghi789',
  });

  await sleep(1000);

  // --- Phase 2: Researcher does 3 turns ---
  console.log('🔍 Researcher: Starting research...');

  for (let turn = 1; turn <= 3; turn++) {
    researcher.turnStarted({
      turn_number: turn,
      input_summary: `Research query: "multi-agent memory architectures 2026" (turn ${turn})`,
      input_tokens: 150 + turn * 50,
    });

    await sleep(800);

    researcher.turnThinking({
      turn_number: turn,
      model: 'claude-sonnet-4-20250514',
      prompt_tokens: 200 + turn * 100,
    });

    await sleep(600);

    researcher.turnActing({
      turn_number: turn,
      tool_name: turn === 1 ? 'web_search' : turn === 2 ? 'arxiv_search' : 'read_paper',
      tool_input_summary: turn === 1
        ? 'query: "agent memory hierarchical 2026"'
        : turn === 2
          ? 'query: "G-Memory NeurIPS 2025"'
          : 'paper_id: arxiv:2506.07398',
    });

    await sleep(1000);

    researcher.turnObserved({
      turn_number: turn,
      tool_name: turn === 1 ? 'web_search' : turn === 2 ? 'arxiv_search' : 'read_paper',
      tool_output_summary: turn === 1
        ? 'Found 12 results on hierarchical memory architectures...'
        : turn === 2
          ? 'G-Memory: 3-tier graph for MAS, NeurIPS 2025 spotlight...'
          : 'Full paper: G-Memory proposes Insight/Query/Interaction hierarchy...',
      output_tokens: 300 + turn * 150,
    });

    await sleep(500);

    researcher.costTokens({
      model: 'claude-sonnet-4-20250514',
      input_tokens: 200 + turn * 100,
      output_tokens: 300 + turn * 150,
      total_tokens: 500 + turn * 250,
      cost_usd: 0.003 * turn,
      cumulative_cost_usd: 0.003 * turn * (turn + 1) / 2,
    });

    researcher.turnCompleted({
      turn_number: turn,
      output_summary: `Completed research turn ${turn}: found key insights on memory architectures`,
      output_tokens: 300 + turn * 150,
      total_tokens: 500 + turn * 250,
      duration_ms: 2500 + turn * 500,
    }, 2500 + turn * 500);

    await sleep(500);
    console.log(`   ✓ Research turn ${turn} complete`);
  }

  // --- Phase 3: Handoff to Critic ---
  console.log('🤝 Handoff: Researcher → Critic');

  researcher.handoffInitiated({
    source_agent_id: 'agent-researcher',
    target_agent_id: 'agent-critic',
    reason: 'Research complete, needs quality evaluation',
    payload_summary: '3 papers analyzed, 5 key findings on memory hierarchies',
  });

  await sleep(500);

  critic.emit('handoff.accepted', {
    source_agent_id: 'agent-researcher',
    target_agent_id: 'agent-critic',
    handoff_id: 'handoff-1',
  });

  await sleep(1000);

  // --- Phase 4: Critic evaluates ---
  console.log('🔎 Critic: Evaluating research...');

  critic.turnStarted({
    turn_number: 1,
    input_summary: 'Evaluate research quality: 3 papers on memory architectures',
    input_tokens: 800,
  });

  await sleep(700);

  critic.turnThinking({
    turn_number: 1,
    model: 'claude-sonnet-4-20250514',
    prompt_tokens: 1200,
  });

  await sleep(1500);

  critic.turnActing({
    turn_number: 1,
    tool_name: 'evaluate',
    tool_input_summary: 'Scoring research on relevance, depth, recency, citation quality',
  });

  await sleep(800);

  critic.turnObserved({
    turn_number: 1,
    tool_name: 'evaluate',
    tool_output_summary: 'Score: 8.5/10. Strong on recency, needs more practical examples.',
    output_tokens: 450,
  });

  await sleep(500);

  critic.costTokens({
    model: 'claude-sonnet-4-20250514',
    input_tokens: 1200,
    output_tokens: 450,
    total_tokens: 1650,
    cost_usd: 0.008,
    cumulative_cost_usd: 0.008,
  });

  critic.turnCompleted({
    turn_number: 1,
    output_summary: 'Research scored 8.5/10. Approved with suggestions for more practical examples.',
    output_tokens: 450,
    total_tokens: 1650,
    duration_ms: 3500,
  }, 3500);

  console.log('   ✓ Critique complete: 8.5/10');

  // --- Phase 5: Handoff to Writer ---
  await sleep(500);
  console.log('🤝 Handoff: Critic → Writer');

  critic.handoffInitiated({
    source_agent_id: 'agent-critic',
    target_agent_id: 'agent-writer',
    reason: 'Research approved, ready for writing',
    payload_summary: 'Research + critique: 8.5/10 score, add practical examples',
  });

  await sleep(500);

  writer.emit('handoff.accepted', {
    source_agent_id: 'agent-critic',
    target_agent_id: 'agent-writer',
    handoff_id: 'handoff-2',
  });

  await sleep(1000);

  // --- Phase 6: Writer produces output ---
  console.log('✍️  Writer: Generating document...');

  writer.turnStarted({
    turn_number: 1,
    input_summary: 'Write comprehensive report on multi-agent memory architectures',
    input_tokens: 2000,
  });

  await sleep(500);

  writer.turnThinking({
    turn_number: 1,
    model: 'claude-opus-4-20250514',
    prompt_tokens: 2500,
  });

  await sleep(2000);

  writer.turnActing({
    turn_number: 1,
    tool_name: 'write_document',
    tool_input_summary: 'Writing 2000-word report with sections: intro, 3-tier hierarchy, practical examples, conclusion',
  });

  await sleep(2000);

  writer.turnObserved({
    turn_number: 1,
    tool_name: 'write_document',
    tool_output_summary: 'Generated 2,150 word report on multi-agent memory architectures with code examples',
    output_tokens: 3200,
  });

  await sleep(500);

  writer.costTokens({
    model: 'claude-opus-4-20250514',
    input_tokens: 2500,
    output_tokens: 3200,
    total_tokens: 5700,
    cost_usd: 0.278,
    cumulative_cost_usd: 0.278,
  });

  writer.turnCompleted({
    turn_number: 1,
    output_summary: 'Report complete: "Multi-Agent Memory Architectures in 2026" — 2,150 words with practical code examples',
    output_tokens: 3200,
    total_tokens: 5700,
    duration_ms: 5000,
  }, 5000);

  console.log('   ✓ Document written');

  // --- Phase 7: Complete all agents ---
  await sleep(500);
  console.log('\n✅ Completing all agents...');

  researcher.agentCompleted({
    result_summary: 'Analyzed 3 papers on memory hierarchies',
    total_turns: 3,
    total_tokens: 2250,
    total_cost_usd: 0.018,
  });

  await sleep(300);

  critic.agentCompleted({
    result_summary: 'Approved research with 8.5/10 score',
    total_turns: 1,
    total_tokens: 1650,
    total_cost_usd: 0.008,
  });

  await sleep(300);

  writer.agentCompleted({
    result_summary: 'Generated 2,150 word report',
    total_turns: 1,
    total_tokens: 5700,
    total_cost_usd: 0.278,
  });

  console.log('\n🧵 Demo complete!');
  console.log(`   Total cost: $${(0.018 + 0.008 + 0.278).toFixed(3)}`);
  console.log('   Open http://localhost:9472 to see the dashboard\n');

  await sleep(1000);

  // Disconnect
  researcher.disconnect();
  critic.disconnect();
  writer.disconnect();

  process.exit(0);
}

run().catch(console.error);
