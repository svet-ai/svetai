import { createClient } from '@libsql/client';

const json=(res,value,status=200)=>{res.status(status).setHeader('Content-Type','application/json; charset=utf-8').setHeader('Cache-Control','no-store');return res.json(value)};
async function digest(value){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('svet_session='))?.slice(13)}
function promptFor(b){const lang=b.language==='ru'?'орыс тілінде':b.language==='en'?'ағылшын тілінде':'қазақ тілінде';return `Сен Қазақстан мектебінің тәжірибелі пән мұғалімі және әдіскерісің. ${lang} бірден қолдануға болатын сапалы материал жаса.\n\nСынып: ${b.grade}; Пән: ${b.subject}; Материал түрі: ${b.kind}; Тақырып: «${b.topic}»; Оқу мақсаты: ${b.objective||'Ресми кодты ойдан шығармай, тақырыпқа сай өлшенетін мақсат құрастыр.'}.\n\nНақты бос шаблон жасама. Тапсырмалар, мысалдар, бағалау критерийлері, дескрипторлар, балл және жауаптарды бер. ҚМЖ болса 45 минутты дәл бөл және мұғалім/оқушы әрекетін, саралау, ресурстар, рефлексия, үй тапсырмасын қос. БЖБ/ТЖБ болса тапсырмалар, балл, дескриптор, толық жауап кілті және балл қою кестесін бер. Жұмыс парағында кемінде 3 нақты тапсырма болсын. Ойын болса ереже, дайын сұрақтар, жауаптар және ұпай жүйесін бер. Нақты мәтін берілмесе жалған дәйексөз ойлап шығарма. Markdown қолдан. Материалдың өзін бірден баста.`}
async function gemini(key,model,prompt){const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:7000,temperature:.35}})});const d=await r.json().catch(()=>({}));return {r,d}}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method Not Allowed'},405);
 try{
  if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)return json(res,{error:'Turso дерекқоры бапталмаған.'},503);
  const session=cookie(req);if(!session)return json(res,{error:'Алдымен аккаунтқа кіріңіз.'},401);
  const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
  const user=await db.execute({sql:'SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? LIMIT 1',args:[await digest(session),Date.now()]});
  if(!user.rows[0])return json(res,{error:'Сессия мерзімі аяқталған. Қайта кіріңіз.'},401);
  const b=typeof req.body==='object'&&req.body?req.body:JSON.parse(req.body||'{}');
  b.topic=String(b.topic||'').trim();b.kind=String(b.kind||'ҚМЖ');b.grade=Number(b.grade);b.subject=String(b.subject||'Қазақ әдебиеті');b.objective=String(b.objective||'').trim();b.language=['kk','ru','en'].includes(b.language)?b.language:'kk';
  if(!b.topic||b.topic.length>500)return json(res,{error:'Тақырыпты енгізіңіз (500 таңбаға дейін).'},400);
  if(!Number.isInteger(b.grade)||b.grade<1||b.grade>11)return json(res,{error:'Сыныпты 1–11 аралығында таңдаңыз.'},400);
  if(!process.env.GEMINI_API_KEY&&!process.env.OPENAI_API_KEY)return json(res,{error:'GEMINI_API_KEY бапталмаған.'},503);
  const prompt=promptFor(b);const models=['gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash-lite'];let last=0;
  if(process.env.GEMINI_API_KEY){for(const model of models){try{const {r,d}=await gemini(process.env.GEMINI_API_KEY,model,prompt);last=r.status;const text=String(d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('\n')||'').trim();if(r.ok&&text)return json(res,{content:text,provider:'Gemini',model});if(![404,429,500,502,503].includes(r.status))break;console.warn('Gemini model fallback',model,r.status)}catch(e){console.warn('Gemini model failed',model,e?.message||e)}}}
  if(process.env.OPENAI_API_KEY){try{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',messages:[{role:'user',content:prompt}],temperature:.35,max_tokens:7000})});const d=await r.json().catch(()=>({}));last=r.status;const text=String(d.choices?.[0]?.message?.content||'').trim();if(r.ok&&text)return json(res,{content:text,provider:'OpenAI',model:process.env.OPENAI_MODEL||'gpt-4.1-mini'})}catch(e){console.warn('OpenAI fallback failed',e?.message||e)}}
  if(last===429)return json(res,{error:'Gemini лимиті уақытша біткен. Бірнеше Gemini моделі автоматты түрде тексерілді.'},429);
  if(last>=500)return json(res,{error:'Gemini қызметі уақытша жауап бермеді. Бірнеше Gemini моделі автоматты түрде тексерілді.'},503);
  return json(res,{error:'Gemini модельдерінің ешқайсысы қолжетімді болмады. Google AI Studio және Vercel Environment Variables тексеріңіз.'},502);
 }catch(e){console.error('AI generation failed',e?.stack||e?.message||e);return json(res,{error:'ЖИ генерациясы кезінде сервер қатесі болды.'},500)}
}
