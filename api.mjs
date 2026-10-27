import {readFile} from 'node:fs/promises';
import {api} from './server.js';
import {createSupabaseDB} from './supabase-db.mjs';

export default async function handler(req,res){
 try{
  const db=createSupabaseDB();
  const headers=new Headers();
  for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
  const origin='https://'+req.headers.host;
  const urlObj=new URL(req.url,origin);
  const routedPath=urlObj.searchParams.get('route');
  const original=routedPath||req.headers['x-vercel-original-path']||req.headers['x-matched-path']||req.url;
  const originalUrl=new URL(original,origin);
  const request=new Request(originalUrl.toString(),{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:typeof req.body==='string'?req.body:JSON.stringify(req.body||{})});
  const response=await api(request,{DB:db,ADMIN_INITIAL_PASSWORD:process.env.ADMIN_INITIAL_PASSWORD,OPENAI_API_KEY:process.env.OPENAI_API_KEY,SOURCE_ARCHIVE:()=>readFile(new URL('./dist/source.zip',import.meta.url))});
  res.statusCode=response.status;
  for(const[k,v]of response.headers)res.setHeader(k,v);
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){
  console.error(e);
  res.statusCode=500;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({error:e?.message||'Сервер қатесі'}));
 }
}
