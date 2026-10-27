import { readFile } from 'node:fs/promises';
import { api } from '../server.js';
import { createSupabaseDB } from '../supabase-db.mjs';

export default async function handler(req, res) {
  try {
    const db = createSupabaseDB();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    }
    const origin = 'https://' + (req.headers.host || 'svet-ai.vercel.app');
    const url = new URL(req.url || '/', origin);
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
    console.error('API handler failed:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'Сервер қатесі. Vercel Logs бөлімін тексеріңіз.' }));
  }
}
