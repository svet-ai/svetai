export default async function handler(req, res) {
  try {
    const mod = await import('../lib/api-handler.js');
    return await mod.default(req, res);
  } catch (error) {
    console.error('Login function bootstrap failed:', error?.stack || error?.message || error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      error: 'LOGIN_BOOTSTRAP_FAILED',
      detail: String(error?.message || 'Unknown function startup error').slice(0, 240)
    }));
  }
}
