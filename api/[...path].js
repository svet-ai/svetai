import { readFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { api } from '../server.js';

function createTursoDB() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return null;

  const client = createClient({ url, authToken });
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind(...values) { return statement(sql, values); },
    async first() {
      const result = await client.execute({ sql, args });
      return result.rows[0] ? { ...result.rows[0] } : null;
    },
    async all() {
      const result = await client.execute({ sql, args });
      return { results: result.rows.map(row => ({ ...row })) };
    },
    async run() {
      return client.execute({ sql, args });
    },
  });

  async function ensureSchema() {
    // Execute schema statements individually for compatibility with Turso/libSQL batch modes.
    const statements = [
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, created INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, grade INTEGER NOT NULL, subject TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS materials_owner_idx ON materials(owner)',
      'CREATE INDEX IF NOT EXISTS attachments_owner_idx ON attachments(owner)',
    ];
    for (const sql of statements) await client.execute({ sql });
  }

  return {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      return client.batch(statements.map(item => ({ sql: item.sql, args: item.args })), 'write');
    },
    ensureSchema,
  };
}

export default async function handler(req, res) {
  try {
    const db = createTursoDB();
    if (db) await db.ensureSchema();

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    }
    const origin = 'https://' + (req.headers.host || 'svet-ai.vercel.app');
    const url = new URL(req.url || '/', origin);
    if (!url.pathname.startsWith('/api/')) {
      url.pathname = '/api' + (url.pathname.startsWith('/') ? url.pathname : '/' + url.pathname);
    }
    const request = new Request(url.toString(), {
      method: req.method || 'GET',
      headers,
      body: ['GET', 'HEAD'].includes(req.method || 'GET')
        ? undefined
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body || {}),
    });
    const response = await api(request, {
      DB: db,
      ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      SOURCE_ARCHIVE: () => readFile(new URL('../dist/source.zip', import.meta.url)),
    });
    res.statusCode = response.status;
    for (const [key, value] of response.headers) res.setHeader(key, value);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    // Log the technical reason in Vercel Runtime Logs without exposing credentials.
    console.error('Turso API handler failed:', error?.stack || error?.message || error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const detail = String(error?.message || 'Белгісіз сервер қатесі').replace(/libsql://[^\s]+/gi, '[database-url]').slice(0, 240);
    res.end(JSON.stringify({ error: 'API қатесі: ' + detail + '. TURSO_DATABASE_URL және TURSO_AUTH_TOKEN баптауларын да тексеріңіз.' }));
  }
}
