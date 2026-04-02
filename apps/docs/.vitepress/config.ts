import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Sutures',
  description: 'Breakpoints for AI Agents — The live intervention + MCP-native operating system for multi-agent swarms',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Adapters', link: '/adapters/overview' },
      { text: 'MCP Tools', link: '/mcp/tools' },
      { text: 'Dashboard', link: '/dashboard/overview' },
      { text: 'API', link: '/api/event-protocol' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Sutures?', link: '/guide/what-is-sutures' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Quick Start (3 Lines)', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Event Protocol', link: '/guide/event-protocol' },
            { text: 'Breakpoints', link: '/guide/breakpoints' },
            { text: 'Memory Debugging', link: '/guide/memory-debugging' },
            { text: 'Fork & Replay', link: '/guide/fork-replay' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'MCP Integration', link: '/guide/mcp-integration' },
            { text: 'Anomaly Detection', link: '/guide/anomaly-detection' },
            { text: 'Collaborative Sessions', link: '/guide/collaborative-sessions' },
          ],
        },
      ],
      '/adapters/': [
        {
          text: 'Adapters',
          items: [
            { text: 'Overview', link: '/adapters/overview' },
            { text: 'LangGraph', link: '/adapters/langgraph' },
            { text: 'CrewAI', link: '/adapters/crewai' },
            { text: 'OpenAI Agents SDK', link: '/adapters/openai' },
            { text: 'Generic (Any Framework)', link: '/adapters/generic' },
          ],
        },
      ],
      '/mcp/': [
        {
          text: 'MCP Server',
          items: [
            { text: 'Tools Reference', link: '/mcp/tools' },
            { text: 'Setup with Claude Code', link: '/mcp/claude-code' },
            { text: 'Setup with Cursor', link: '/mcp/cursor' },
          ],
        },
      ],
      '/dashboard/': [
        {
          text: 'Dashboard',
          items: [
            { text: 'Overview', link: '/dashboard/overview' },
            { text: 'Topology Canvas', link: '/dashboard/topology' },
            { text: 'Agent Inspector', link: '/dashboard/inspector' },
            { text: 'Timeline', link: '/dashboard/timeline' },
            { text: 'Memory Debugger', link: '/dashboard/memory' },
            { text: 'Cost Tracking', link: '/dashboard/cost' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Event Protocol v1.0', link: '/api/event-protocol' },
            { text: 'Breakpoint Conditions', link: '/api/breakpoint-conditions' },
            { text: 'WebSocket API', link: '/api/websocket' },
            { text: 'REST API', link: '/api/rest' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/anupmaster/sutures' },
    ],

    footer: {
      message: 'Released under the Apache 2.0 License.',
      copyright: 'Copyright 2026 Anup Karanjkar',
    },

    search: {
      provider: 'local',
    },
  },
})
