import {createClient} from '@libsql/client/web';
import {readFile} from 'node:fs/promises';
import {api} from './server.js';
let client;
export default async function handler(req,res){
try{
 let db;
 if(process.env.TURSO_DATABASE_URL){client ||= createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args}bind(...args){return new Statement(this.sql,args)}async first(){return(await client.execute({sql:this.sql,args:this.args})).rows[0]||null}async all(){return{results:(await client.execute({sql:this.sql,args:this.args})).rows}}async run(){return client.execute({sql:this.sql,args:this.args})}}db={prepare:sql=>new Statement(sql),batch:statements=>client.batch(statements.map(s=>({sql:s.sql,args:s.args})),'write')};}
 const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
 const origin='https://'+req.headers.host;
 const original=req.headers['x-vercel-original-path']||req.url;
 const request=new Request(origin+original,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:typeof req.body==='string'?req.body:JSON.stringify(req.body||{})});
 const response=await api(request,{DB:db,ADMIN_INITIAL_PASSWORD:process.env.ADMIN_INITIAL_PASSWORD,OPENAI_API_KEY:process.env.OPENAI_API_KEY,SOURCE_ARCHIVE:()=>readFile(new URL('./dist/source.zip',import.meta.url))});res.statusCode=response.status;for(const[k,v]of response.headers)res.setHeader(k,v);res.end(Buffer.from(await response.arrayBuffer()));
}catch(e){console.error(e.message);res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Сервер қатесі. Дерекқор қосылымын тексеріңіз.'}));}
}
