'use strict';
// Development-only localhost harness; production asset routes stay unchanged.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const baseline=process.env.OIL_BENCH_BASELINE ? path.resolve(process.env.OIL_BENCH_BASELINE) : null;
const publicAssets=new Set([...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map(m=>'/'+m[1]));
const own=new Map([['/','gpu-benchmark.html'],['/gpu-benchmark.html','gpu-benchmark.html'],['/gpu-benchmark.js','gpu-benchmark.js']]);
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400);res.end();return;}
  let source;
  if(own.has(pathname))source=path.join(__dirname,own.get(pathname));
  else if(publicAssets.has(pathname))source=path.join(root,pathname.slice(1));
  else if(baseline&&pathname.startsWith('/baseline/')&&publicAssets.has(pathname.slice(9)))source=path.join(baseline,pathname.slice(10));
  if(!source||!fs.existsSync(source)){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':source.endsWith('.html')?'text/html; charset=utf-8':source.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(source).pipe(res);
});
server.listen(3001,'127.0.0.1',()=>console.log('Oil Island graphics benchmark: http://127.0.0.1:3001/'));
process.once('SIGINT',()=>server.close());
process.once('SIGTERM',()=>server.close());
