import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import {api,hashPassword} from './server.js';
const sqlite=new DatabaseSync(':memory:');for(const f of fs.readdirSync('.').filter(x=>x.endsWith('.sql')).filter(x=>x.endsWith('.sql'))){sqlite.exec(fs.readFileSync(f,'utf8').replaceAll('--> statement-breakpoint',''));}
class Statement{constructor(sql,params=[]){this.sql=sql;this.params=params}bind(...p){return new Statement(this.sql,p)}async first(){return sqlite.prepare(this.sql).get(...this.params)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.params)}}async run(){return sqlite.prepare(this.sql).run(...this.params)}}
const env={DB:{prepare:s=>new Statement(s),batch:async s=>{for(const x of s)await x.run()}},ADMIN_INITIAL_PASSWORD:'test-initial-password'};
let adminCookie='',teacherCookie='',studentCookie='',teacherId='',materialId='';
async function call(path,method='GET',body,cookie=''){const req=new Request('https://test.site/api/'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),origin:'https://test.site'},body:body?JSON.stringify(body):undefined});const r=await api(req,env);return{status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
test('credential hashing uses random salts and reproducible verification',async()=>{const a=await hashPassword('abcdefgh'),b=await hashPassword('abcdefgh');assert.notEqual(a,b);assert.equal(a,await hashPassword('abcdefgh',a.split(':')[0]));});
test('complete account, authorization and persistence lifecycle',async()=>{
 assert.equal((await call('status')).body.ai,false);
 assert.equal((await call('users','POST',{})).status,401);assert.equal((await call('source')).status,401);
 assert.equal((await call('login','POST',{email:'admin@svetai.kz',password:'wrong'})).status,401);
 let r=await call('login','POST',{email:'admin@svetai.kz',password:env.ADMIN_INITIAL_PASSWORD});assert.equal(r.status,200);adminCookie=r.cookie;assert.equal(r.body.user.role,'admin');
 r=await call('users','POST',{name:'Teacher',email:'teacher@test.kz',password:'password123',role:'teacher'},adminCookie);assert.equal(r.status,200);
 r=await call('users','POST',{name:'Student',email:'student@test.kz',password:'password123',role:'student'},adminCookie);assert.equal(r.status,200);
 r=await call('login','POST',{email:'teacher@test.kz',password:'password123'});teacherCookie=r.cookie;teacherId=r.body.user.id;
 r=await call('login','POST',{email:'student@test.kz',password:'password123'});studentCookie=r.cookie;
 assert.equal((await call('users','GET',null,teacherCookie)).status,403);assert.equal((await call('source','GET',null,teacherCookie)).status,403);
 assert.equal((await call('materials','POST',{title:'No',content:'x'},studentCookie)).status,403);
 r=await call('materials','POST',{title:'Lesson',grade:6,kind:'ҚМЖ',subject:'Қазақ әдебиеті',content:'Draft',published:false},teacherCookie);assert.equal(r.status,200);materialId=r.body.id;
 assert.equal((await call('materials')).body.materials.length,0);assert.equal((await call('materials','GET',null,teacherCookie)).body.materials.length,1);
 r=await call('materials','POST',{id:materialId,title:'Lesson',grade:6,kind:'ҚМЖ',subject:'Қазақ әдебиеті',content:'Published',published:true},teacherCookie);assert.equal(r.status,200);assert.equal((await call('materials')).body.materials.length,0);const pending=(await call('materials','GET',null,adminCookie)).body.materials[0];assert.equal(pending.published,2);assert.equal((await call('materials','POST',{...pending,published:true},adminCookie)).status,200);assert.equal((await call('materials')).body.materials[0].content,'Published');
 assert.equal((await call('materials','DELETE',{id:materialId},studentCookie)).status,403);
 assert.equal((await call('files','POST',{name:'test.pdf',mime:'application/pdf',data:btoa('file test')},teacherCookie)).status,200);
 const f=(await call('files','GET',null,teacherCookie)).body.files[0];assert.ok(f.id);assert.equal((await call('files','GET',null,studentCookie)).body.files.length,0);
 assert.equal((await call('generate','POST',{topic:'Abai'},teacherCookie)).status,503);
 assert.equal((await call('users','PATCH',{id:teacherId,name:'New name',email:'new@test.kz',password:'newpassword'},adminCookie)).status,200);
 assert.equal((await call('me','GET',null,teacherCookie)).body.user,null);
 assert.equal((await call('login','POST',{email:'new@test.kz',password:'newpassword'})).status,200);
 assert.equal((await call('users','DELETE',{id:'initial-admin'},adminCookie)).status,400);
 assert.equal((await call('logout','POST',{},adminCookie)).status,200);assert.equal((await call('users','GET',null,adminCookie)).status,401);
});
test('rejects cross origin mutations before processing',async()=>{const r=await api(new Request('https://test.site/api/login',{method:'POST',headers:{origin:'https://evil.site'},body:'{}'}),env);assert.equal(r.status,403)});
test('repeated failed logins are rate limited',async()=>{let r;for(let i=0;i<11;i++)r=await call('login','POST',{email:'nobody@test.kz',password:'bad'});assert.equal(r.status,429)});
