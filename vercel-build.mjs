import{spawnSync}from'node:child_process';
const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{stdio:'inherit',env:{...process.env,SVET_BUILD_TARGET:'vercel'}});
process.exit(r.status||0);
