import type { Clock, LogFields, Logger, LogLevel, Telemetry, TimerHandle } from '@mosaic/core';

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as TimerHandle,
  clearTimeout: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
};

export function consoleLogger(scope = 'mosaic', minLevel: LogLevel = 'info'): Logger {
  const order: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  return {
    log(level: LogLevel, message: string, fields?: LogFields): void {
      if (order.indexOf(level) < order.indexOf(minLevel)) return;
      console[level](`[${scope}] ${message}`, ...(fields ? [fields] : []));
    },
    child: (child: string) => consoleLogger(`${scope}.${child}`, minLevel),
  };
}

/** Telemetry is opt-in. Until there is a setting to opt in with, it does nothing. */
export const noopTelemetry: Telemetry = { event() {}, timing() {} };
