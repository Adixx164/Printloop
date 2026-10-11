// 01-backend/services/metrics.ts
import { Gauge, Registry, collectDefaultMetrics } from 'prom-client';

// Create a dedicated registry for backend metrics
const backendMetricsRegistry = new Registry();

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register: backendMetricsRegistry, prefix: 'backend_' });

// Custom metrics for backend
export const stuckRendersGauge = new Gauge({
  name: 'printloop_stuck_renders',
  help: 'Number of renders stuck > 15min',
  registers: [backendMetricsRegistry],
});

// Export the registry for the metrics endpoint
export { backendMetricsRegistry };