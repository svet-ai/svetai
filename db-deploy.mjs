import{createClient}from'@libsql/client/web';import fs from'node:fs/promises';
if(!process.env.TURSO_DATABASE_URL)throw Error('TURSO_DATABASE_URL is required');
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
await db.execute('CREATE TABLE IF NOT EXISTS _svet_migrations(name TEXT PRIMARY KEY, applied INTEGER NOT NULL)');
for(const name of(await fs.readdir('.')).filter(x=>x.endsWith('.sql')).sort()){const existing=await db.execute({sql:'SELECT name FROM _svet_migrations WHERE name=?',args:[name]});if(existing.rows.length)continue;const sql=await fs.readFile(name,'utf8');const statements=sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(sql=>({sql,args:[]}));statements.push({sql:'INSERT INTO _svet_migrations(name,applied) VALUES(?,?)',args:[name,Date.now()]});await db.batch(statements,'write');console.log('Applied schema migration:',name)}
db.close();
