export default function handler(req, res) {
  const providers = {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    ai: Object.values(providers).some(Boolean),
    providers,
    fallback: providers.groq || providers.openai,
    images: false,
    route: 'api/status'
  });
}
