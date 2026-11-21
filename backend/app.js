/* CRM API starter. createApp() receives its Firestore, Auth and FieldValue dependencies so the routes can be
 * exercised by automated tests with an in-memory fake (see test/api.test.js). server.js wires real Firebase.
 * Not connected to the demo UI. Review and test with the Firebase Emulator before any real use. */
import express from 'express';
import {createHash} from 'node:crypto';
import {PolicyError,ensure,normalizeEmail,id,text,date,amount,positiveOrZero,currencyList,methods,installmentLabel,oneOf,active,isAdmin,has,canCurrency,authorizePayment,validateCorrection} from './policy.js';

export const teamPermissions=['Inquiries','Leads','Clients','Matters','Tasks','Billing','Communications','USD accounts','BDT accounts','Other currency accounts','Edit amounts','Edit payment details','Request invoice changes'];

export function createApp({db,auth,FieldValue,ownerEmail,logger=console}){
 ensure(db&&auth&&FieldValue,'Firestore, Auth and FieldValue are required.',500);
 const owner=normalizeEmail(ownerEmail);
 const app=express();
 app.disable('x-powered-by');
 app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cache-Control':'no-store'});next();});
 app.use(express.json({limit:'64kb',strict:true}));
 const userKey=email=>createHash('sha256').update(email).digest('hex');
 const userRef=email=>db.collection('users').doc(userKey(email));
 const auditRef=()=>db.collection('audit').doc();
 const time=()=>FieldValue.serverTimestamp();
 const safeDoc=(collection,value)=>db.collection(collection).doc(id(value));
 const safeUser=s=>{ensure(s.exists,'User access has not been granted.');return active(s.data());};
 const body=req=>req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};

 const requireAuth=async(req,res,next)=>{try{
   const header=String(req.headers.authorization||'');ensure(header.startsWith('Bearer '),'Sign-in required.',401);
   const token=await auth.verifyIdToken(header.slice(7),true);ensure(token.email_verified===true&&token.email,'A verified email is required.',401);
   const email=normalizeEmail(token.email);req.identity={uid:token.uid,email};
   if(email===owner){await db.runTransaction(async tx=>{const ref=userRef(email),snapshot=await tx.get(ref);if(!snapshot.exists)tx.create(ref,{email,role:'Admin',status:'Active',permissions:[],createdAt:time()});});}
   next();
 }catch(e){next(e instanceof PolicyError?e:new PolicyError('Authentication failed.',401));}};
 app.use('/api',requireAuth);
 const handler=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 async function getActor(req,tx){const s=tx?await tx.get(userRef(req.identity.email)):await userRef(req.identity.email).get();const u=safeUser(s);ensure(u.email===req.identity.email,'Account mismatch.');return u;}
 function requireOwner(u){ensure(u.email===owner&&isAdmin(u),'Only the firm owner can manage team access.');}
 function requirePermission(u,permission){ensure(has(u,permission),`${permission} permission required.`);}
 function event(tx,actor,action,recordId,details={}){tx.create(auditRef(),{actorEmail:actor.email,action,recordId,details,createdAt:time()});}
 const docData=d=>({id:d.id,...d.data()});
 const assignmentList=(u,list)=>{const assignments=isAdmin(u)&&Array.isArray(list)?[...new Set(list.map(normalizeEmail))]:[u.email];ensure(assignments.length>0&&assignments.length<=30,'Invalid assignments.',400);return assignments;};

 app.get('/api/me',handler(async(req,res)=>{const u=await getActor(req);res.json({email:u.email,role:u.role,permissions:u.permissions||[]});}));
 app.get('/api/team',handler(async(req,res)=>{const u=await getActor(req);requireOwner(u);const data=await db.collection('users').limit(250).get();res.json(data.docs.map(docData));}));
 app.put('/api/team/:email',handler(async(req,res)=>{
  const v=body(req),target=normalizeEmail(req.params.email);ensure(target!==owner,'The owner account cannot be modified here.',400);
  const role=oneOf(v.role,['Admin','Staff'],'role'),status=oneOf(v.status,['Active','Disabled'],'status');
  ensure(Array.isArray(v.permissions)&&v.permissions.every(p=>teamPermissions.includes(p)),'Invalid permissions.',400);
  const permissions=[...new Set(v.permissions)];
  await db.runTransaction(async tx=>{const u=await getActor(req,tx);requireOwner(u);const ref=userRef(target),old=await tx.get(ref);tx.set(ref,{email:target,role,status,permissions,updatedAt:time()},{merge:true});event(tx,u,'team_access_updated',target,{before:old.exists?old.data():null,after:{role,status,permissions}});});
  res.json({ok:true});
 }));
 app.get('/api/clients',handler(async(req,res)=>{
  const u=await getActor(req);requirePermission(u,'Clients');const q=isAdmin(u)?db.collection('clients'):db.collection('clients').where('assignedEmails','array-contains',u.email);const snap=await q.limit(250).get();res.json(snap.docs.map(docData));
 }));
 app.post('/api/clients',handler(async(req,res)=>{
  const input=body(req),ref=db.collection('clients').doc(),name=text(input.name,'name'),email=input.email?normalizeEmail(input.email):'',segment=oneOf(input.segment,['Bangladesh','NRB'],'client category'),country=text(input.country,'country');
  await db.runTransaction(async tx=>{const u=await getActor(req,tx);requirePermission(u,'Clients');const assignments=assignmentList(u,input.assignedEmails);tx.create(ref,{name,email,segment,country,assignedEmails:assignments,createdAt:time()});event(tx,u,'client_created',ref.id);});res.status(201).json({id:ref.id});
 }));
 app.get('/api/matters',handler(async(req,res)=>{
  const u=await getActor(req);requirePermission(u,'Matters');const q=isAdmin(u)?db.collection('matters'):db.collection('matters').where('assignedEmails','array-contains',u.email);const snap=await q.limit(250).get();
  res.json(snap.docs.map(doc=>{const x=docData(doc);if(!canCurrency(u,x.currency)){delete x.professionalFeeCents;delete x.governmentFeeCents;delete x.paidApprovedCents;}return x;}));
 }));
 app.post('/api/matters',handler(async(req,res)=>{
  const v=body(req),ref=db.collection('matters').doc(),clientRef=safeDoc('clients',v.clientId),currency=oneOf(v.currency,currencyList,'currency');
  const data={clientId:clientRef.id,title:text(v.title,'title'),category:oneOf(v.category,['U.S. Immigration','Bangladesh Law','Global Visa'],'category'),country:text(v.country,'country'),currency,professionalFeeCents:positiveOrZero(v.professionalFeeCents),governmentFeeCents:positiveOrZero(v.governmentFeeCents),paidApprovedCents:0,status:'In progress',nextDate:v.nextDate?date(v.nextDate):''};
  await db.runTransaction(async tx=>{const u=await getActor(req,tx);requirePermission(u,'Matters');ensure(canCurrency(u,currency),'Currency permission required.');const c=await tx.get(clientRef);ensure(c.exists,'Client not found.',404);ensure(isAdmin(u)||(c.data().assignedEmails||[]).includes(u.email),'Client is not assigned to you.');const assignments=assignmentList(u,v.assignedEmails);tx.create(ref,{...data,assignedEmails:assignments,createdAt:time()});event(tx,u,'matter_created',ref.id,{matterId:ref.id});});res.status(201).json({id:ref.id});
 }));
 app.get('/api/matters/:id/installments',handler(async(req,res)=>{
  const u=await getActor(req),mref=safeDoc('matters',req.params.id),snap=await mref.get();authorizePayment(u,snap.exists?snap.data():null);const q=await db.collection('installments').where('matterId','==',mref.id).limit(250).get();res.json(q.docs.map(docData));
 }));
 app.post('/api/installments',handler(async(req,res)=>{
  const v=body(req),mref=safeDoc('matters',v.matterId),ref=db.collection('installments').doc(),value=amount(v.amountCents),dueDate=date(v.dueDate),label=installmentLabel(v.label);
  await db.runTransaction(async tx=>{
   const u=await getActor(req,tx),snap=await tx.get(mref),existing=await tx.get(db.collection('installments').where('matterId','==',mref.id));
   const matter=snap.exists?snap.data():null;authorizePayment(u,matter);
   const scheduled=existing.docs.reduce((n,d)=>n+(d.data().amountCents||0),0),agreed=(matter.professionalFeeCents||0)+(matter.governmentFeeCents||0);
   ensure(scheduled+value<=agreed,'Installments would exceed the agreed fees.',400);
   tx.create(ref,{matterId:mref.id,label,amountCents:value,paidApprovedCents:0,dueDate,createdAt:time()});event(tx,u,'installment_created',ref.id,{matterId:mref.id,amountCents:value});
  });res.status(201).json({id:ref.id});
 }));
 app.get('/api/matters/:id/payments',handler(async(req,res)=>{
  const u=await getActor(req),mref=safeDoc('matters',req.params.id),snap=await mref.get();authorizePayment(u,snap.exists?snap.data():null);const q=await db.collection('payments').where('matterId','==',mref.id).limit(250).get();res.json(q.docs.map(docData));
 }));
 app.post('/api/payments',handler(async(req,res)=>{
  const v=body(req),iref=safeDoc('installments',v.installmentId),pref=safeDoc('payments',v.requestId),value=amount(v.amountCents),paidDate=date(v.date),coverage=oneOf(v.coverage,['Partial','Full'],'coverage'),method=oneOf(v.method,methods,'payment method');
  await db.runTransaction(async tx=>{const u=await getActor(req,tx),i=await tx.get(iref),previous=await tx.get(pref);ensure(i.exists,'Installment not found.',404);ensure(!previous.exists,'Request ID was already used.',409);const mref=safeDoc('matters',i.data().matterId),m=await tx.get(mref);authorizePayment(u,m.exists?m.data():null);ensure(value<=i.data().amountCents-i.data().paidApprovedCents,'Amount exceeds installment balance.',400);tx.create(pref,{matterId:mref.id,installmentId:iref.id,amountCents:value,refundedApprovedCents:0,date:paidDate,coverage,method,status:'Pending',createdBy:u.email,createdAt:time()});event(tx,u,'payment_recorded',pref.id,{matterId:mref.id,previousStatus:'Unpaid',newStatus:'Pending',amountCents:value,currency:m.data().currency});});res.status(201).json({id:pref.id,status:'Pending'});
 }));
 app.post('/api/payments/:id/approve',handler(async(req,res)=>{
  const pref=safeDoc('payments',req.params.id);
  await db.runTransaction(async tx=>{const u=await getActor(req,tx);ensure(isAdmin(u),'Admin approval required.');const p=await tx.get(pref);ensure(p.exists&&p.data().status==='Pending','Payment is not pending.',400);const iref=safeDoc('installments',p.data().installmentId),mref=safeDoc('matters',p.data().matterId),i=await tx.get(iref),m=await tx.get(mref);ensure(i.exists&&m.exists,'Related records not found.',404);const payment=p.data(),installment=i.data(),matter=m.data();ensure(payment.amountCents<=installment.amountCents-installment.paidApprovedCents,'Payment exceeds installment.',400);ensure(matter.paidApprovedCents+payment.amountCents<=matter.professionalFeeCents+matter.governmentFeeCents,'Payment exceeds agreed fees.',400);tx.update(pref,{status:'Approved',approvedBy:u.email,approvedAt:time()});tx.update(iref,{paidApprovedCents:installment.paidApprovedCents+payment.amountCents});tx.update(mref,{paidApprovedCents:matter.paidApprovedCents+payment.amountCents});event(tx,u,'payment_approved',pref.id,{matterId:mref.id,previousStatus:'Pending',newStatus:'Approved',amountCents:payment.amountCents,currency:matter.currency});});res.json({ok:true});
 }));
 app.post('/api/payments/:id/reject',handler(async(req,res)=>{
  const pref=safeDoc('payments',req.params.id),reason=text(body(req).reason,'reason',300);
  await db.runTransaction(async tx=>{const u=await getActor(req,tx);ensure(isAdmin(u),'Admin review required.');const p=await tx.get(pref);ensure(p.exists&&p.data().status==='Pending','Payment is not pending.',400);const payment=p.data();tx.update(pref,{status:'Rejected',rejectedBy:u.email,rejectedAt:time(),rejectionReason:reason});event(tx,u,'payment_rejected',pref.id,{matterId:payment.matterId,previousStatus:'Pending',newStatus:'Rejected',amountCents:payment.amountCents,reason});});res.json({ok:true});
 }));
 app.patch('/api/payments/:id',handler(async(req,res)=>{
  const pref=safeDoc('payments',req.params.id),patch=body(req);
  await db.runTransaction(async tx=>{const u=await getActor(req,tx),p=await tx.get(pref);ensure(p.exists,'Payment not found.',404);const payment=p.data(),iref=safeDoc('installments',payment.installmentId),mref=safeDoc('matters',payment.matterId),i=await tx.get(iref),m=await tx.get(mref);ensure(i.exists&&m.exists,'Related records not found.',404);const changes=validateCorrection(u,m.data(),payment,i.data(),patch),delta=payment.status==='Approved'&&changes.amountCents?changes.amountCents.after-changes.amountCents.before:0;ensure(m.data().paidApprovedCents+delta<=m.data().professionalFeeCents+m.data().governmentFeeCents,'Amount exceeds agreed fees.',400);tx.update(pref,{...Object.fromEntries(Object.entries(changes).map(([k,v])=>[k,v.after])),updatedAt:time()});if(delta){tx.update(iref,{paidApprovedCents:i.data().paidApprovedCents+delta});tx.update(mref,{paidApprovedCents:m.data().paidApprovedCents+delta});}event(tx,u,'payment_corrected',pref.id,{matterId:mref.id,currency:m.data().currency,changes});});res.json({ok:true});
 }));
 app.get('/api/matters/:id/refunds',handler(async(req,res)=>{
  const u=await getActor(req),mref=safeDoc('matters',req.params.id),snap=await mref.get();authorizePayment(u,snap.exists?snap.data():null);const q=await db.collection('refunds').where('matterId','==',mref.id).limit(250).get();res.json(q.docs.map(docData));
 }));
 app.post('/api/refunds',handler(async(req,res)=>{
  const v=body(req),pref=safeDoc('payments',v.paymentId),ref=safeDoc('refunds',v.requestId),value=amount(v.amountCents),refundDate=date(v.date),method=oneOf(v.method,methods,'refund method'),reason=text(v.reason,'reason',300);
  await db.runTransaction(async tx=>{const u=await getActor(req,tx),p=await tx.get(pref),existing=await tx.get(ref);ensure(p.exists&&p.data().status==='Approved','Original approved payment required.',400);ensure(!existing.exists,'Request ID was already used.',409);const mref=safeDoc('matters',p.data().matterId),m=await tx.get(mref);authorizePayment(u,m.exists?m.data():null);ensure(refundDate>=p.data().date,'Refund date cannot precede the original payment.',400);ensure(value<=p.data().amountCents-p.data().refundedApprovedCents,'Refund exceeds the original payment.',400);tx.create(ref,{paymentId:pref.id,matterId:mref.id,amountCents:value,date:refundDate,method,reason,status:'Pending',createdBy:u.email,createdAt:time()});event(tx,u,'refund_recorded',ref.id,{matterId:mref.id,amountCents:value,currency:m.data().currency});});res.status(201).json({id:ref.id,status:'Pending'});
 }));
 app.post('/api/refunds/:id/approve',handler(async(req,res)=>{
  const rref=safeDoc('refunds',req.params.id);
  await db.runTransaction(async tx=>{const u=await getActor(req,tx);ensure(isAdmin(u),'Admin approval required.');const r=await tx.get(rref);ensure(r.exists&&r.data().status==='Pending','Refund is not pending.',400);const refund=r.data(),pref=safeDoc('payments',refund.paymentId),mref=safeDoc('matters',refund.matterId),p=await tx.get(pref),m=await tx.get(mref);ensure(p.exists&&m.exists&&p.data().matterId===mref.id&&p.data().status==='Approved','Original approved payment required.',400);const iref=safeDoc('installments',p.data().installmentId),i=await tx.get(iref);ensure(i.exists,'Installment not found.',404);ensure(refund.amountCents<=p.data().amountCents-p.data().refundedApprovedCents,'Refund exceeds the original payment.',400);ensure(refund.amountCents<=i.data().paidApprovedCents&&refund.amountCents<=m.data().paidApprovedCents,'Refund exceeds approved balance.',400);tx.update(rref,{status:'Approved',approvedBy:u.email,approvedAt:time()});tx.update(pref,{refundedApprovedCents:p.data().refundedApprovedCents+refund.amountCents});tx.update(iref,{paidApprovedCents:i.data().paidApprovedCents-refund.amountCents});tx.update(mref,{paidApprovedCents:m.data().paidApprovedCents-refund.amountCents});event(tx,u,'refund_approved',rref.id,{matterId:mref.id,paymentId:pref.id,amountCents:refund.amountCents,currency:m.data().currency});});res.json({ok:true});
 }));
 app.get('/api/matters/:id/audit',handler(async(req,res)=>{
  const u=await getActor(req),mref=safeDoc('matters',req.params.id),m=await mref.get();authorizePayment(u,m.exists?m.data():null);const snap=await db.collection('audit').where('details.matterId','==',mref.id).limit(250).get();res.json(snap.docs.map(docData));
 }));
 app.use('/api',(req,res)=>res.status(404).json({error:'Not found.'}));
 app.use((err,req,res,next)=>{
  // Body-parser errors (malformed JSON, oversized body) are client errors, not server failures.
  if(!(err instanceof PolicyError)&&err&&Number.isInteger(err.status)&&err.status>=400&&err.status<500){res.status(err.status).json({error:err.type==='entity.too.large'?'Request body is too large.':'Invalid request body.'});return;}
  const status=err instanceof PolicyError?err.status:500;
  if(status>=500)logger.error?.('CRM API error',err);
  res.status(status).json({error:status===500?'The request could not be completed.':err.message});
 });
 return app;
}
