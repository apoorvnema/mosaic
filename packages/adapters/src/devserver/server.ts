import { FileNotFoundError, type FileChange } from '@mosaic/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeFileSystem } from '../node/fs';
import { DEV_VAULT_BASE } from './protocol';

type Next = () => void;

/**
 * Connect-style middleware exposing one local folder to HttpFileSystem. Runs in
 * the Vite dev server only, bound to localhost; it is a development convenience
 * and must never be deployed.
 */
export function createDevVaultMiddleware(vaultDir: string) {
  const fs = new NodeFileSystem(vaultDir);
  const clients = new Set<ServerResponse>();
  let stopWatching: (() => void) | undefined;

  const broadcast = (change: FileChange) => {
    for (const client of clients) client.write(`data: ${JSON.stringify(change)}\n\n`);
  };

  const readBody = async (req: IncomingMessage): Promise<Uint8Array> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return new Uint8Array(Buffer.concat(chunks));
  };

  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: Next,
  ): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(`${DEV_VAULT_BASE}/`)) return next();
    const op = url.pathname.slice(DEV_VAULT_BASE.length + 1);
    const path = url.searchParams.get('path') ?? '';
    const json = (value: unknown) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(value ?? null));
    };
    try {
      if (op === 'watch') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write(': connected\n\n');
        clients.add(res);
        stopWatching ??= fs.watch('', broadcast);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (op === 'read') {
        res.setHeader('content-type', 'application/octet-stream');
        return void res.end(await fs.read(path));
      }
      if (op === 'list')
        return json(await fs.list(path, { recursive: url.searchParams.get('recursive') === '1' }));
      if (op === 'stat') return json(await fs.stat(path));
      if (req.method !== 'POST') {
        res.statusCode = 405;
        return void res.end('POST required');
      }
      if (op === 'write') await fs.write(path, await readBody(req));
      else if (op === 'mkdir') await fs.mkdir(path);
      else if (op === 'move') await fs.move(path, url.searchParams.get('to') ?? '');
      else if (op === 'delete') await fs.delete(path);
      else {
        res.statusCode = 400;
        return void res.end(`Unknown op: ${op}`);
      }
      json({ ok: true });
    } catch (error) {
      res.statusCode = error instanceof FileNotFoundError ? 404 : 500;
      res.end(error instanceof Error ? error.message : String(error));
    }
  };

  return { middleware, close: () => stopWatching?.() };
}
