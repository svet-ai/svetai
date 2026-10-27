const enc=new TextEncoder();
export const cookieName='svet_session';
export async function hashPassword(value,salt=crypto.randomUUID()) { const key=await crypto.subtle.importKey('raw',enc.encode(value),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256);return salt+':'+Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,'0')).join(''); }
async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))),x=>x.toString(16).padStart(2,'0')).join('')}
function equal(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
export async function api(req,env){
 const url=new URL(req.url),path=url.pathname,db=env.DB;
 if(req.method!=='GET'&&req.headers.get('origin')&&req.headers.get('origin')!==url.origin)return json({error:'Origin rejected'},403);
 if(path==='/api/status')return json({ai:!!env.OPENAI_API_KEY,images:false});
 if(!db)return json({error:'Дерекқор қосылмаған. DB binding қажет.'},503);
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
 const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 let user=token?await stmt('SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',await digest(token),Date.now()).first():null;
 if(path==='/api/me')return json({user});
 if(req.method==='POST'&&path==='/api/logout'){if(token)await stmt('DELETE FROM sessions WHERE token=?',await digest(token)).run();return json({ok:true},200,{'Set-Cookie':cookieName+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});}
 let body={};if(req.method!=='GET'){if(Number(req.headers.get('content-length')||0)>3000000)return json({error:'Файл тым үлкен'},413);try{const raw=await req.text();if(raw.length>3000000)return json({error:'Файл тым үлкен'},413);body=JSON.parse(raw||'{}')}catch{return json({error:'Invalid JSON'},400)}}
 if(path==='/api/login'&&req.method==='POST'){
  const email=String(body.email||'').trim().toLowerCase(),pw=String(body.password||'');
  const k=await digest((req.headers.get('cf-connecting-ip')||'local')+':'+email),now=Date.now();
  const a=await stmt('SELECT * FROM attempts WHERE key=?',k).first();if(a&&a.until>now&&a.count>=10)return json({error:'Көп әрекет жасалды. 15 минуттан кейін қайталаңыз.'},429);
  if(!a||a.until<now)await stmt('INSERT INTO attempts(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,until=excluded.until',k,now+900000).run();else await stmt('UPDATE attempts SET count=count+1 WHERE key=?',k).run();
  if(env.ADMIN_INITIAL_PASSWORD){const exists=await stmt("SELECT id FROM users WHERE role='admin' LIMIT 1").first();if(!exists){await stmt('INSERT OR IGNORE INTO users(id,email,name,password,role,created) VALUES(?,?,?,?,?,?)','initial-admin','admin@svetai.kz','Әкімші',await hashPassword(env.ADMIN_INITIAL_PASSWORD),'admin',now).run();}}
  const found=await stmt('SELECT * FROM users WHERE email=?',email).first();const expected=found?.password||await hashPassword('dummy-password','dummy');const check=await hashPassword(pw,expected.split(':')[0]);if(!found||!equal(expected,check))return json({error:'Логин немесе құпиясөз қате.'},401);
  await stmt('DELETE FROM attempts WHERE key=?',k).run();await stmt('DELETE FROM sessions WHERE expires<?',now).run();const session=crypto.randomUUID()+crypto.randomUUID();await stmt('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await digest(session),found.id,now+604800000).run();
  return json({user:{id:found.id,email:found.email,name:found.name,role:found.role}},200,{'Set-Cookie':cookieName+'='+session+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800'});
 }
 if(path==='/api/materials'&&req.method==='GET'){
 const rows=user?.role==='admin'?await stmt('SELECT * FROM materials ORDER BY created DESC LIMIT 300').all():user?await stmt('SELECT * FROM materials WHERE published=1 OR owner=? ORDER BY created DESC LIMIT 300',user.id).all():await stmt('SELECT * FROM materials WHERE published=1 ORDER BY created DESC LIMIT 300').all();return json({materials:rows.results});}
 if(!user)return json({error:'Алдымен аккаунтқа кіріңіз.'},401);
 if(path==='/api/source'){if(user.role!=='admin')return json({error:'Әкімшіге ғана рұқсат'},403);if(env.SOURCE_ARCHIVE)return new Response(await env.SOURCE_ARCHIVE(),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename=svetai-source.zip','Cache-Control':'no-store'}});const response=await serveAsset(new Request(url.origin+'/source.zip'),true);return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename=svetai-source.zip','Cache-Control':'no-store'}});}
 if(path==='/api/users'){
  if(user.role!=='admin')return json({error:'Әкімшіге ғана рұқсат.'},403);
  if(req.method==='GET')return json({users:(await stmt('SELECT id,email,name,role,created FROM users ORDER BY created DESC').all()).results});
  if(!['POST','PATCH','DELETE'].includes(req.method))return json({error:'Method'},405);
  if(req.method==='DELETE'){if(body.id===user.id)return json({error:'Өз аккаунтыңызды өшіруге болмайды.'},400);await db.batch([stmt('DELETE FROM sessions WHERE user_id=?',body.id),stmt('DELETE FROM attachments WHERE owner=?',body.id),stmt('DELETE FROM materials WHERE owner=?',body.id),stmt('DELETE FROM users WHERE id=?',body.id)]);return json({ok:true});}
  const email=String(body.email||'').toLowerCase().trim(),name=String(body.name||'').trim();if(!/^\S+@\S+\.\S+$/.test(email)||!name||name.length>100)return json({error:'Аты мен email-ді дұрыс толтырыңыз.'},400);
  if((req.method==='POST'||body.password)&&String(body.password||'').length<8)return json({error:'Құпиясөз кемінде 8 таңба болуы керек.'},400);
  if(req.method==='POST')await stmt('INSERT INTO users(id,email,name,password,role,created) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),email,name,await hashPassword(body.password),body.role==='student'?'student':'teacher',Date.now()).run();
  else {const old=await stmt('SELECT * FROM users WHERE id=?',body.id).first();if(!old)return json({error:'Аккаунт табылмады'},404);await stmt('UPDATE users SET email=?,name=?,password=? WHERE id=?',email,name,body.password?await hashPassword(body.password):old.password,body.id).run();await stmt('DELETE FROM sessions WHERE user_id=?',body.id).run();}
  return json({ok:true});
 }
 if(path==='/api/password'&&req.method==='POST'){const old=await stmt('SELECT password FROM users WHERE id=?',user.id).first();if(!equal(old.password,await hashPassword(String(body.current||''),old.password.split(':')[0])))return json({error:'Қазіргі құпиясөз қате.'},400);if(String(body.password||'').length<8)return json({error:'Кемінде 8 таңба қажет.'},400);await db.batch([stmt('UPDATE users SET password=? WHERE id=?',await hashPassword(body.password),user.id),stmt('DELETE FROM sessions WHERE user_id=?',user.id)]);return json({ok:true});}
 if(path==='/api/materials'){
  if(user.role==='student')return json({error:'Мұғалімге ғана рұқсат.'},403);
  if(req.method==='POST'){
   if(!body.title||!body.content||String(body.content).length>200000)return json({error:'Материал атауы мен мәтінін тексеріңіз.'},400);const id=body.id||crypto.randomUUID();const old=await stmt('SELECT owner FROM materials WHERE id=?',id).first();if(old&&old.owner!==user.id&&user.role!=='admin')return json({error:'Рұқсат жоқ'},403);
   await stmt('INSERT INTO materials(id,owner,title,grade,subject,kind,content,published,created) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,grade=excluded.grade,subject=excluded.subject,kind=excluded.kind,content=excluded.content,published=excluded.published',id,old?.owner||user.id,String(body.title).slice(0,200),Number(body.grade)||5,String(body.subject||'Қазақ тілі').slice(0,100),String(body.kind||'ҚМЖ').slice(0,100),String(body.content),body.published?(user.role==='admin'?1:2):0,Date.now()).run();return json({ok:true,id});
  }
  if(req.method==='DELETE'){const old=await stmt('SELECT owner FROM materials WHERE id=?',body.id).first();if(!old||old.owner!==user.id&&user.role!=='admin')return json({error:'Рұқсат жоқ'},403);await stmt('DELETE FROM materials WHERE id=?',body.id).run();return json({ok:true});}
 }
 if(path==='/api/files'){
  if(req.method==='GET')return json({files:(await stmt('SELECT id,name,mime,created FROM attachments WHERE owner=? ORDER BY created DESC',user.id).all()).results});
  if(req.method==='DELETE'){await stmt('DELETE FROM attachments WHERE id=? AND owner=?',body.id,user.id).run();return json({ok:true});}
  if(req.method==='POST'){if(user.role==='student')return json({error:'Мұғалімге ғана рұқсат'},403);if(!/\.(pdf|docx?|pptx?)$/i.test(body.name||'')||!body.data||body.data.length>1400000)return json({error:'Word, PDF немесе PPTX файлын таңдаңыз (1 MB дейін).'},400);await stmt('INSERT INTO attachments(id,owner,name,mime,data,created) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),user.id,String(body.name).slice(0,200),String(body.mime||'application/octet-stream'),body.data,Date.now()).run();return json({ok:true});}
 }
 if(path.startsWith('/api/files/')&&req.method==='GET'){const f=await stmt('SELECT * FROM attachments WHERE id=? AND owner=?',path.split('/').pop(),user.id).first();if(!f)return json({error:'Табылмады'},404);const bytes=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':f.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(f.name),'X-Content-Type-Options':'nosniff'}});}
 if(path==='/api/generate'&&req.method==='POST'){
  if(!env.OPENAI_API_KEY)return json({error:'ЖИ қызметі қосылмаған. Қазір құрылымды үлгі режимін пайдаланыңыз.'},503);
  if(!body.topic||String(body.topic).length>500)return json({error:'Тақырыпты енгізіңіз'},400);
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',max_tokens:4500,messages:[{role:'system',content:'You are a qualified Kazakhstan school teacher. Produce accurate, detailed, editable educational material in the requested language. Include concrete tasks, answers, criteria, descriptors and timing when applicable. Do not invent official curriculum codes. Clearly mark teacher-review requirements. Plain text only.'},{role:'user',content:JSON.stringify({type:body.kind,topic:body.topic,grade:body.grade,subject:body.subject,language:body.language,objective:body.objective,slides:body.slides})}]})});if(!response.ok)return json({error:'ЖИ қызметі жауап бермеді. API кілті мен лимитті тексеріңіз.'},502);const data=await response.json();return json({content:data.choices?.[0]?.message?.content||''});
 }
 return json({error:'Табылмады'},404);
}
export default {async fetch(req,env){try{if(new URL(req.url).pathname.startsWith('/api/'))return await api(req,env);return await serveAsset(req);}catch(e){console.error(e?.message);return json({error:/UNIQUE/.test(e?.message||'')?'Бұл email қолданыста.':'Сервер қатесі. Қайталап көріңіз.'},500);}}};
// Replaced by the deterministic build with bundled frontend assets.
async function serveAsset(req){return new Response('Build required',{status:503});}
