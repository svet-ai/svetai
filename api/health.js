import { createClient } from '@libsql/client';

export default async function handler(_req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const hasUrl = Boolean(process.env.TURSO_DATABASE_URL);
  const hasToken = Boolean(process.env.TURSO_AUTH_TOKEN);
  const result = {
    ok: false,
    route: 'api/health',
    env: {
      TURSO_DATABASE_URL: hasUrl,
      TURSO_AUTH_TOKEN: hasToken,
      ADMIN_INITIAL_PASSWORD: Boolean(process.env.ADMIN_INITIAL_PASSWORD),
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    },
    database: 'not-tested',
  };

  if (!hasUrl || !hasToken) {
    res.statusCode = 503;
    result.error = 'Turso environment variables are missing in this deployment.';
    res.end(JSON.stringify(result));
    return;
  }

  try {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    await client.execute('SELECT 1 AS ok');
    result.database = 'connected';
    result.ok = true;
    res.statusCode = 200;
  } catch (error) {
    result.database = 'failed';
    result.error = String(error?.message || 'Database connection failed')
      .replace(/libsql:\/\/[^\s]+/gi, '[database-url]')
      .slice(0, 220);
    res.statusCode = 503;
  }

  res.end(JSON.stringify(result));
}
