import { createClient } from '@libsql/client';

const json = (res, value, status = 200) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').setHeader('Cache-Control', 'no-store');
  return res.json(value);
};

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
}

function getCookie(req, name) {
  return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
}

function promptFor({ kind, topic, grade, subject, objective, language, slides }) {
  const languageName = language === 'ru' ? 'орыс тілінде' : language === 'en' ? 'ағылшын тілінде' : 'қазақ тілінде';
  return `Сен Қазақстан мектебінің тәжірибелі пән мұғалімі, әдіскер және оқу материалдарын құрастырушысысың. ${languageName} бірден қолдануға болатын сапалы материал жаса.

Негізгі деректер:
- Сынып: ${grade}
- Пән: ${subject}
- Материал түрі: ${kind}
- Тақырып: «${topic}»
- Оқу мақсаты: ${objective || 'Кодын ойдан шығармай, тақырыпқа сай өлшенетін мақсаттарды құрастыр.'}
- Слайд саны: ${slides}

Талаптар:
- Бос жалпы шаблон жасама. Нақты тапсырмалар, мысалдар, бағалау критерийлері, дескрипторлар және жауаптар бер.
- Қазақстан мектебінің жас ерекшелігіне және пәнге сәйкестендір.
- ҚМЖ болса: 45 минутты дәл бөл, оқу мақсаты, сабақ мақсаты, құндылық, бағалау критерийлері, мұғалім/оқушы әрекеті, нақты тапсырмалар, дескриптор/балл, саралау, ресурстар, рефлексия, үй тапсырмасын бер.
- БЖБ/ТЖБ болса: тапсырмалар, балл, дескрипторлар, толық жауап кілті және балл қою кестесін бер.
- Жұмыс парағы болса: кемінде 3 әртүрлі нақты тапсырма және соңында мұғалімге жауап кілті болсын.
- Ойын болса: ереже, кезеңдер, дайын сұрақ/карточкалар, дұрыс жауаптар, ұпай және жеңімпазды анықтау тәсілі болсын.
- Презентация болса: әр слайдқа тақырып және мазмұнды тармақтар бер.
- Нақты шығарма мәтіні берілмесе, жалған дәйексөз ойлап шығарма; мұғалім таңдайтын мәтінді ашық көрсет.
- Ресми оқу мақсатының кодын ойдан шығарма.
- Соңында қысқа «Мұғалімге ескерту» бөлімін ғана қажет болса қос.
- Жауапты Markdown форматында, таза әрі көшіріп қолдануға ыңғайлы етіп бер.

Материалдың өзін бірден баста.`;
}

async function callGemini(key, prompt) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 7000, temperature: 0.35 } })
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function callGroq(key, prompt) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'Сен кәсіби мектеп әдіскерісің. Қазақ тілінде сапалы оқу материалын жаса.', }, { role: 'user', content: prompt }], temperature: 0.35, max_tokens: 7000 })
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, { error: 'Method Not Allowed' }, 405);
  try {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) return json(res, { error: 'Turso дерекқоры бапталмаған.' }, 503);

    const db = createClient({ url, authToken });
    const session = getCookie(req, 'svet_session');
    if (!session) return json(res, { error: 'Алдымен аккаунтқа кіріңіз.' }, 401);
    const token = await digest(session);
    const user = await db.execute({ sql: 'SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? LIMIT 1', args: [token, Date.now()] });
    if (!user.rows[0]) return json(res, { error: 'Сессия мерзімі аяқталған. Қайта кіріңіз.' }, 401);

    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
    const topic = String(body.topic || '').trim();
    const kind = String(body.kind || 'ҚМЖ');
    const grade = Number(body.grade);
    const subject = String(body.subject || 'Қазақ әдебиеті');
    const objective = String(body.objective || '').trim();
    const language = ['kk', 'ru', 'en'].includes(body.language) ? body.language : 'kk';
    const slides = Math.max(3, Math.min(15, Number(body.slides) || 6));
    if (!topic || topic.length > 500) return json(res, { error: 'Тақырыпты енгізіңіз (500 таңбаға дейін).' }, 400);
    if (!Number.isInteger(grade) || grade < 1 || grade > 11) return json(res, { error: 'Сыныпты 1–11 аралығында таңдаңыз.' }, 400);

    const prompt = promptFor({ kind, topic, grade, subject, objective, language, slides });
    let provider = '';
    let content = '';
    let lastStatus = 0;

    if (process.env.GEMINI_API_KEY) {
      try {
        const result = await callGemini(process.env.GEMINI_API_KEY, prompt);
        lastStatus = result.response.status;
        if (result.response.ok) content = String(result.data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '').trim();
        if (content) provider = 'Gemini';
      } catch (error) {
        console.warn('Gemini request failed; fallback will be used:', error?.message || error);
      }
    }

    if (!content && process.env.GROQ_API_KEY) {
      try {
        const result = await callGroq(process.env.GROQ_API_KEY, prompt);
        lastStatus = result.response.status;
        if (result.response.ok) content = String(result.data.choices?.[0]?.message?.content || '').trim();
        if (content) provider = 'Groq';
      } catch (error) {
        console.warn('Groq request failed:', error?.message || error);
      }
    }

    if (!content && process.env.OPENAI_API_KEY) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', messages: [{ role: 'system', content: prompt }], temperature: 0.35, max_tokens: 7000 })
        });
        const data = await response.json().catch(() => ({}));
        lastStatus = response.status;
        if (response.ok) content = String(data.choices?.[0]?.message?.content || '').trim();
        if (content) provider = 'OpenAI';
      } catch (error) {
        console.warn('OpenAI fallback failed:', error?.message || error);
      }
    }

    if (!content) {
      if (lastStatus === 429) return json(res, { error: 'AI лимиті уақытша біткен. Gemini → Groq → OpenAI кезегі тексерілді. Кейінірек қайта көріңіз.' }, 429);
      if (lastStatus >= 500) return json(res, { error: 'AI провайдерлері уақытша жауап бермеді. Gemini → Groq → OpenAI автоматты түрде тексерілді.' }, 503);
      return json(res, { error: 'ЖИ провайдерлерінің ешқайсысы жауап бермеді. Vercel Environment Variables ішінен GEMINI_API_KEY немесе GROQ_API_KEY тексеріңіз.' }, 502);
    }

    return json(res, { content, provider, model: provider === 'Gemini' ? 'gemini-3.8-flash' : provider === 'Groq' ? 'llama-3.3-70b-versatile' : (process.env.OPENAI_MODEL || 'gpt-4.1-mini') });
  } catch (error) {
    console.error('AI generation route failed:', error?.stack || error?.message || error);
    return json(res, { error: 'ЖИ генерациясы кезінде сервер қатесі болды. Vercel Runtime Logs тексеріңіз.' }, 500);
  }
}
