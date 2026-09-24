/**
 * Minimal structured logger (V2-16, v3-polish #19 half).
 *
 * Emits one JSON object per line — the shape Axiom / BetterStack /
 * Datadog / CloudWatch all ingest natively. Deliberately
 * dependency-free so it works today; the field shape matches pino's
 * (`level`, `time`, `msg`, plus arbitrary bindings) so swapping in
 * real pino later is a drop-in: replace `createLogger` internals,
 * keep every call-site.
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.info({ tenantId, printJobId }, 'render enqueued');
 *   const reqLog = logger.child({ requestId, tenantId });
 *   reqLog.error({ err: e.message }, 'charge failed');
 *
 * Level gate via LOG_LEVEL env (debug < info < warn < error);
 * default info. Set LOG_PRETTY=true for human-readable dev output.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const threshold = LEVEL_RANK[(process.env.LOG_LEVEL as Level) || 'info'] ?? 20;
const pretty = process.env.LOG_PRETTY === 'true';

export interface Logger {
  debug(obj: Record<string, unknown> | string, msg?: string): void;
  info(obj: Record<string, unknown> | string, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown> | string, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

function emit(
  level: Level,
  bindings: Record<string, unknown>,
  objOrMsg: Record<string, unknown> | string,
  maybeMsg?: string,
): void {
  if (LEVEL_RANK[level] < threshold) return;

  let fields: Record<string, unknown>;
  let msg: string | undefined;
  if (typeof objOrMsg === 'string') {
    fields = {};
    msg = objOrMsg;
  } else {
    fields = objOrMsg;
    msg = maybeMsg;
  }

  const record = {
    level,
    time: new Date().toISOString(),
    ...bindings,
    ...fields,
    ...(msg ? { msg } : {}),
  };

  const line = pretty
    ? `${record.time} ${level.toUpperCase().padEnd(5)} ${msg ?? ''} ${
        Object.keys(fields).length || Object.keys(bindings).length
          ? JSON.stringify({ ...bindings, ...fields })
          : ''
      }`.trimEnd()
    : JSON.stringify(record);

  // stderr for warn/error so log shippers can split streams.
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

function makeLogger(bindings: Record<string, unknown>): Logger {
  return {
    debug: (o, m) => emit('debug', bindings, o, m),
    info: (o, m) => emit('info', bindings, o, m),
    warn: (o, m) => emit('warn', bindings, o, m),
    error: (o, m) => emit('error', bindings, o, m),
    child: (extra) => makeLogger({ ...bindings, ...extra }),
  };
}

export const logger: Logger = makeLogger({ svc: 'printloop-api' });
