import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Resolve dist/ next to this file, not relative to the shell's current directory.
export const root=resolve(fileURLToPath(new URL('./dist',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.zip':'application/zip','.json':'application/json; charset=utf-8'};
export const securityHeaders={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};

export function createServer(){
  return http.createServer(async(req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{...securityHeaders,'Allow':'GET, HEAD','Content-Type':'text/plain'});res.end('Method not allowed');return;}
    let pathname;
    try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}
    catch{res.writeHead(400,{...securityHeaders,'Content-Type':'text/plain'});res.end('Bad request');return;}
    const file=resolve(join(root,pathname==='/'?'index.html':pathname));
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403,{...securityHeaders,'Content-Type':'text/plain'});res.end('Forbidden');return;}
    try{
      const data=await readFile(file);
      res.writeHead(200,{...securityHeaders,'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404,{...securityHeaders,'Content-Type':'text/plain'});res.end('Not found');}
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=Number(process.env.PORT)||3000,host=process.env.HOST||'0.0.0.0';
  createServer().listen(port,host,()=>console.log(`CRM demo available at http://localhost:${port} (listening on ${host})`));
}
