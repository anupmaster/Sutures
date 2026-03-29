/**
 * OTEL Exporter — Optional OpenTelemetry span export.
 *
 * Maps AgentEvents to OTEL spans following GenAI semantic conventions.
 * Wraps @opentelemetry/exporter-trace-otlp-http.
 */

import { context, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { AgentEvent } from './schemas.js';

export interface OtelExporterConfig {
  /** OTLP HTTP endpoint. Default: http://localhost:4318/v1/traces */
  endpoint?: string;
  /** Service name for the resource. Default: sutures-collector */
  serviceName?: string;
  /** Whether the exporter is enabled. Default: false */
  enabled?: boolean;
}

export class OtelExporter {
  private provider: BasicTracerProvider | null = null;
  private readonly enabled: boolean;
  private readonly endpoint: string;
  private readonly serviceName: string;

  constructor(config: OtelExporterConfig = {}) {
    this.enabled = config.enabled ?? false;
    this.endpoint = config.endpoint ?? 'http://localhost:4318/v1/traces';
    this.serviceName = config.serviceName ?? 'sutures-collector';

    if (this.enabled) {
      this.init();
    }
  }

  private init(): void {
    try {
      const exporter = new OTLPTraceExporter({
        url: this.endpoint,
      });

      this.provider = new BasicTracerProvider({
        resource: new Resource({
          [ATTR_SERVICE_NAME]: this.serviceName,
        }),
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      });

      this.provider.register();
      console.log(`[OtelExporter] Initialized — exporting to ${this.endpoint}`);
    } catch (err) {
      console.error('[OtelExporter] Failed to initialize:', err);
      this.provider = null;
    }
  }

  /** Export an AgentEvent as an OTEL span. No-op if disabled. */
  exportEvent(event: AgentEvent): void {
    if (!this.enabled || !this.provider) return;

    try {
      const tracer = trace.getTracer('sutures-collector', '0.1.0');

      const spanName = `sutures.${event.event_type}`;
      const startTime = new Date(event.timestamp);

      const span = tracer.startSpan(
        spanName,
        {
          kind: SpanKind.INTERNAL,
          startTime,
          attributes: {
            'sutures.event_id': event.event_id,
            'sutures.swarm_id': event.swarm_id,
            'sutures.agent_id': event.agent_id,
            'sutures.event_type': event.event_type,
            'sutures.severity': event.severity,
            'sutures.protocol_version': event.protocol_version,
          },
        },
        context.active(),
      );

      // Map core fields to OTEL semantic conventions
      if (event.parent_agent_id) {
        span.setAttribute('sutures.parent_agent_id', event.parent_agent_id);
      }

      // Map cost data to GenAI conventions
      const data = event.data;
      if (event.event_type === 'cost.tokens') {
        const inputTokens = data['input_tokens'];
        if (typeof inputTokens === 'number') {
          span.setAttribute('gen_ai.usage.input_tokens', inputTokens);
        }
        const outputTokens = data['output_tokens'];
        if (typeof outputTokens === 'number') {
          span.setAttribute('gen_ai.usage.output_tokens', outputTokens);
        }
      }
      const costUsd = data['cost_usd'];
      if (typeof costUsd === 'number') {
        span.setAttribute('sutures.cost.usd', costUsd);
      }
      const model = data['model'];
      if (typeof model === 'string') {
        span.setAttribute('gen_ai.request.model', model);
      }
      const toolName = data['tool_name'];
      if (typeof toolName === 'string') {
        span.setAttribute('sutures.tool.name', toolName);
      }

      // Mark error spans
      if (event.severity === 'error' || event.severity === 'critical') {
        const errorMsg = data['error'];
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: typeof errorMsg === 'string' ? errorMsg : event.event_type,
        });
      }

      // Set duration if available, otherwise end immediately
      if (event.duration_ms != null) {
        const endTime = new Date(startTime.getTime() + event.duration_ms);
        span.end(endTime);
      } else {
        span.end(startTime);
      }
    } catch (err) {
      console.error('[OtelExporter] Failed to export event:', err);
    }
  }

  /** Flush pending spans and shut down. */
  async shutdown(): Promise<void> {
    if (this.provider) {
      try {
        await this.provider.shutdown();
        console.log('[OtelExporter] Shut down.');
      } catch (err) {
        console.error('[OtelExporter] Shutdown error:', err);
      }
    }
  }
}
