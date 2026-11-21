// Minimal in-memory stand-in for the parts of firebase-admin used by app.js. It enforces Firestore's
// transaction rule that every read happens before the first write, and applies writes atomically.
import {randomUUID} from 'node:crypto';

const SERVER_TIME=Symbol('serverTimestamp');
export const FieldValue={serverTimestamp:()=>SERVER_TIME};
const clone=v=>v===undefined?undefined:structuredClone(v);
const resolveTimes=v=>{if(v===SERVER_TIME)return new Date().toISOString();if(Array.isArray(v))return v.map(resolveTimes);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolveTimes(x)]));return v;};
const field=(data,path)=>path.split('.').reduce((o,k)=>o?.[k],data);

class Snapshot{constructor(id,data){this.id=id;this._data=clone(data);this.exists=data!==undefined;}data(){return clone(this._data);}}
class DocRef{
 constructor(db,collection,id){this.db=db;this.collection=collection;this.id=id;}
 get key(){return `${this.collection}/${this.id}`;}
 async get(){return new Snapshot(this.id,this.db.store.get(this.key));}
}
class Query{
 constructor(db,collection,filters=[],max=Infinity){this.db=db;this.collection=collection;this.filters=filters;this.max=max;}
 where(path,op,value){if(!['==','array-contains'].includes(op))throw new Error(`Unsupported operator ${op}`);return new Query(this.db,this.collection,[...this.filters,{path,op,value}],this.max);}
 limit(n){return new Query(this.db,this.collection,this.filters,n);}
 async get(){
  const docs=[];
  for(const [key,data] of this.db.store){
   const [col,id]=key.split('/');if(col!==this.collection)continue;
   if(this.filters.every(f=>{const v=field(data,f.path);return f.op==='=='?v===f.value:Array.isArray(v)&&v.includes(f.value);}))docs.push(new Snapshot(id,data));
  }
  return {docs:docs.slice(0,this.max),size:Math.min(docs.length,this.max)};
 }
}
class CollectionRef extends Query{doc(id=randomUUID().replace(/-/g,'')){return new DocRef(this.db,this.collection,id);}}

class Transaction{
 constructor(db){this.db=db;this.writes=[];}
 async get(target){if(this.writes.length)throw new Error('Firestore transactions require all reads to be executed before all writes.');return target.get();}
 create(ref,data){this.writes.push(()=>{if(this.db.store.has(ref.key))throw new Error(`Document already exists: ${ref.key}`);this.db.store.set(ref.key,clone(resolveTimes(data)));});}
 set(ref,data,options={}){this.writes.push(()=>{const old=options.merge?this.db.store.get(ref.key)||{}:{};this.db.store.set(ref.key,{...old,...clone(resolveTimes(data))});});}
 update(ref,data){this.writes.push(()=>{if(!this.db.store.has(ref.key))throw new Error(`No document to update: ${ref.key}`);this.db.store.set(ref.key,{...this.db.store.get(ref.key),...clone(resolveTimes(data))});});}
}

export class FakeFirestore{
 constructor(){this.store=new Map();}
 collection(name){return new CollectionRef(this,name);}
 async runTransaction(fn){
  const tx=new Transaction(this),result=await fn(tx),backup=new Map(this.store);
  try{for(const w of tx.writes)w();}catch(e){this.store=backup;throw e;}
  return result;
 }
 all(collection){return [...this.store].filter(([k])=>k.startsWith(collection+'/')).map(([k,v])=>({id:k.split('/')[1],...v}));}
}

export class FakeAuth{
 constructor(){this.tokens=new Map();}
 issue(token,claims){this.tokens.set(token,claims);return token;}
 async verifyIdToken(token){const c=this.tokens.get(token);if(!c)throw new Error('invalid token');return c;}
}
