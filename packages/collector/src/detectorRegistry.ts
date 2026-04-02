/**
 * Detector Registry — Pluggable anomaly detection.
 * The AnomalyEngine uses this to run all registered detectors.
 */

import type { AgentEvent, AnomalyAlert } from './schemas.js';

export interface AnomalyDetector {
  name: string;
  evaluate(event: AgentEvent): AnomalyAlert[];
  clear?(): void;
}

export class DetectorRegistry {
  private detectors = new Map<string, AnomalyDetector>();

  register(detector: AnomalyDetector): void {
    this.detectors.set(detector.name, detector);
  }

  unregister(name: string): boolean {
    return this.detectors.delete(name);
  }

  evaluateAll(event: AgentEvent): AnomalyAlert[] {
    const alerts: AnomalyAlert[] = [];
    for (const detector of this.detectors.values()) {
      const results = detector.evaluate(event);
      alerts.push(...results);
    }
    return alerts;
  }

  clearAll(): void {
    for (const detector of this.detectors.values()) {
      detector.clear?.();
    }
  }

  names(): string[] {
    return [...this.detectors.keys()];
  }
}
