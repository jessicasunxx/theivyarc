import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
const entries=[];
async function collect(dir='public') {
 for(const item of await readdir(dir,{withFileTypes:true})){
  if(item.name.startsWith('.')) continue;
  const full=path.join(dir,item.name);
  if(item.isDirectory()) await collect(full);
  else {
   const ext=path.extname(full);
   const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpeg':'image/jpeg','.webp':'image/webp'}[ext];
   if(!type) throw new Error('Unexpected public asset type');
   entries.push(['/'+path.relative('public',full),{type,body:(await readFile(full)).toString('base64')}]);
  }
 }
}
await collect();
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
const code=await readFile('worker/contact.mjs','utf8');
await writeFile('dist/server/index.js',code+'\nexport default createWorker(new Map('+JSON.stringify(entries)+'));\n');
console.log(`Built Worker with ${entries.length} public assets.`);
