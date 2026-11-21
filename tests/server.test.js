import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,root} from '../server.js';
import {basename} from 'node:path';

test('static server serves dist from its own folder with security headers and blocks traversal',async t=>{
 assert.equal(basename(root),'dist');
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`;
 const index=await fetch(base+'/');
 assert.equal(index.status,200);
 assert.match(index.headers.get('content-type'),/text\/html/);
 assert.match(index.headers.get('content-security-policy'),/default-src 'self'/);
 assert.equal(index.headers.get('x-content-type-options'),'nosniff');
 assert.match(await index.text(),/app\.js/);
 assert.equal((await fetch(base+'/model.js')).headers.get('content-type'),'text/javascript; charset=utf-8');
 for(const attempt of ['/%2e%2e/server.js','/..%5cserver.js','/..%2fpackage.json','/%2e%2e%5c%2e%2e%5cpackage.json']){
  const res=await fetch(base+attempt);
  assert.ok([403,404].includes(res.status),`${attempt} must not be served (got ${res.status})`);
 }
 assert.equal((await fetch(base+'/missing.js')).status,404);
 assert.equal((await fetch(base+'/%E0%A4%A')).status,400);
 assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
});
