import{spawnSync}from'node:child_process';
if(!process.env.TURSO_DATABASE_URL){console.error('Configure TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and ADMIN_INITIAL_PASSWORD in Vercel before deployment.');process.exit(1)}
for(const args of [['db-deploy.mjs']]){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status)process.exit(r.status)}
const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{stdio:'inherit',env:{...process.env,SVET_BUILD_TARGET:'vercel'}});process.exit(r.status||0);
