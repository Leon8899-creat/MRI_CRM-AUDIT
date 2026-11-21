export const storageKey = 'mri-crm-demo-v1';
export const uid = () => globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function today() {
  const f = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function plusDays(date, n) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
export function toCents(value) {
  const s=String(value).trim();
  if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(s)) throw new Error('Enter a valid amount with at most two decimal places.');
  const [a,b='']=s.split('.'); const n=Number(a)*100+Number((b+'00').slice(0,2));
  if(!Number.isSafeInteger(n)) throw new Error('Amount is too large.'); return n;
}
export function ordinal(n) {if(!Number.isSafeInteger(n)||n<1)throw new Error('Invalid installment number.');const mod=n%100,suffix=(mod>=11&&mod<=13)?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th');return `${n}${suffix}`;}
export function nextInstallmentNumber(state,matterId) {
 const legacy={'initial':1,'first':1,'second':2,'third':3,'fourth':4,'fifth':5,'sixth':6,'seventh':7,'eighth':8,'ninth':9,'tenth':10};
 const rows=state.installments.filter(i=>i.matterId===matterId);let max=0;
 for(const row of rows){const label=String(row.label||'').toLowerCase(),numeric=label.match(/^(\d+)(?:st|nd|rd|th)\b/),word=label.match(/^([a-z]+)/);const n=Number(row.number)||(numeric?Number(numeric[1]):legacy[word?.[1]]||0);if(Number.isSafeInteger(n)&&n>max)max=n;}
 return Math.max(rows.length,max)+1;
}
export const money = (n, c='USD') => new Intl.NumberFormat('en-US',{style:'currency',currency:c,minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(n)||0)/100);
export function refundedForPayment(state, paymentId) {return (state.refunds||[]).filter(r=>r.paymentId===paymentId&&r.status==='Approved').reduce((n,r)=>n+r.amount,0);}
export function paidFor(state, installmentId) {return state.payments.filter(p=>p.installmentId===installmentId && p.status==='Approved').reduce((n,p)=>n+p.amount-refundedForPayment(state,p.id),0);}
export function invoiceStatus(total, paid, refunded=0) {if(total>0&&paid>=total)return 'PAID';if(paid>0)return 'PARTIAL PAYMENT';if(refunded>0)return 'REFUNDED';return 'UNPAID';}
export function approveRefund(state,id) {
 const r=(state.refunds||[]).find(x=>x.id===id);if(!r||r.status!=='Pending')throw new Error('Refund is not pending.');
 const p=state.payments.find(x=>x.id===r.paymentId);if(!p||p.status!=='Approved'||p.matterId!==r.matterId)throw new Error('Original approved payment not found.');
 if(!Number.isSafeInteger(r.amount)||r.amount<=0||r.amount>p.amount-refundedForPayment(state,p.id))throw new Error('Refund exceeds the remaining original payment.');
 r.status='Approved';r.approvedAt=new Date().toISOString();return r;
}
export function remainingFor(state, installment) {return Math.max(0,installment.amount-paidFor(state,installment.id));}
export function installmentStatus(state, installment, now=today()) {
  const due=remainingFor(state,installment); if(due===0) return 'Paid';
  if(installment.dueDate && installment.dueDate<now) return 'Overdue';
  return paidFor(state,installment.id)>0?'Partial':'Upcoming';
}
export function approvePayment(state,id) {
  const p=state.payments.find(x=>x.id===id); if(!p||p.status!=='Pending') throw new Error('Payment is not pending.');
  const i=state.installments.find(x=>x.id===p.installmentId); if(!i||i.matterId!==p.matterId) throw new Error('Installment not found.');
  if(p.amount<=0||p.amount>remainingFor(state,i)) throw new Error('This payment exceeds the remaining installment balance.');
  p.status='Approved';p.approvedAt=new Date().toISOString(); return p;
}
export function totalsByCurrency(state) {
  const out={};
  for(const i of state.installments){const m=state.matters.find(x=>x.id===i.matterId);if(!m)continue;out[m.currency]??={scheduled:0,paid:0,balance:0};out[m.currency].scheduled+=i.amount;out[m.currency].paid+=paidFor(state,i.id);out[m.currency].balance+=remainingFor(state,i);}
  return out;
}
export function mayViewCurrency(user, currency) {
  if(!user || user.status!=='Active') return false;
  if(user.role==='Admin') return true;
  const permission=currency==='USD'?'USD accounts':currency==='BDT'?'BDT accounts':'Other currency accounts';
  return (user.permissions||[]).includes(permission);
}
export function mayEditAmount(user, currency) {
  return mayViewCurrency(user,currency) && (user.role==='Admin'||(user.permissions||[]).includes('Edit amounts'));
}
export function mayEditPaymentDetails(user, currency) {
  return mayViewCurrency(user,currency) && (user.role==='Admin'||(user.permissions||[]).includes('Edit payment details'));
}
export function editPaymentDetails(state, paymentId, updates, actor, timestamp=new Date().toISOString()) {
  const p=state.payments.find(x=>x.id===paymentId), m=p&&state.matters.find(x=>x.id===p.matterId);
  if(!p||!m) throw new Error('Payment not found.');
  if(!mayEditPaymentDetails(actor,m.currency)) throw new Error('Admin must grant payment-detail edit access.');
  if(p.status==='Approved' && actor.role!=='Admin') throw new Error('Only an admin can edit an approved payment.');
  if(p.status==='Rejected') throw new Error('Rejected payments cannot be edited.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(updates.date||'')) throw new Error('Enter a valid payment date.');
  if(!['Partial','Full'].includes(updates.coverage)) throw new Error('Select partial or full.');
  if(!['Cash','Cheque','Bank transfer','Online payment','Card','Other'].includes(updates.method)) throw new Error('Select a valid payment method.');
  const changes=[['Payment date','date'],['Partial / Full','coverage'],['Mode of payment','method']].filter(([,key])=>(p[key]||'')!==updates[key]);
  if(!changes.length) throw new Error('No payment details have changed.');
  for(const [field,key] of changes){
    (state.paymentEvents??=[]).push({id:uid(),paymentId:p.id,matterId:m.id,currency:m.currency,field,oldValue:p[key]||'Not specified',newValue:updates[key],actorId:actor.id,actorName:actor.name,changedAt:timestamp});
    p[key]=updates[key];
  }
  return p;
}
export function editPaymentAmount(state, paymentId, newAmount, actor, timestamp=new Date().toISOString()) {
  const p=state.payments.find(x=>x.id===paymentId);
  const m=p&&state.matters.find(x=>x.id===p.matterId);
  const i=p&&state.installments.find(x=>x.id===p.installmentId);
  if(!p||!m||!i||i.matterId!==m.id) throw new Error('Payment or installment not found.');
  if(!mayEditAmount(actor,m.currency)) throw new Error('Admin must grant currency and amount-edit access.');
  if(p.status==='Approved' && actor.role!=='Admin') throw new Error('Only an admin can edit an approved payment.');
  if(p.status==='Rejected') throw new Error('Rejected payments cannot be edited.');
  if(!Number.isSafeInteger(newAmount)||newAmount<=0) throw new Error('Enter a valid positive amount.');
  const limit=remainingFor(state,i)+(p.status==='Approved'?p.amount:0);
  if(newAmount>limit) throw new Error('Amount exceeds the installment balance.');
  if(p.status==='Approved'&&newAmount<refundedForPayment(state,p.id)) throw new Error('Amount cannot be less than approved refunds.');
  if(newAmount===p.amount) throw new Error('The amount has not changed.');
  const oldAmount=p.amount; p.amount=newAmount;
  (state.paymentEvents??=[]).push({id:uid(),paymentId:p.id,matterId:m.id,currency:m.currency,field:'Amount',oldAmount,newAmount,actorId:actor.id,actorName:actor.name,changedAt:timestamp});
  return p;
}
export function requestInvoiceChange(state, invoiceId, professionalFee, governmentFee, reason, user, timestamp=new Date().toISOString()) {
 const inv=state.invoices.find(x=>x.id===invoiceId),m=inv&&state.matters.find(x=>x.id===inv.matterId);
 if(!inv||!m)throw new Error('Invoice not found.');
 if(!mayViewCurrency(user,m.currency)||!(user.role==='Admin'||(user.permissions||[]).includes('Request invoice changes')))throw new Error('Admin must grant invoice change request access.');
 if(!Number.isSafeInteger(professionalFee)||!Number.isSafeInteger(governmentFee)||professionalFee<0||governmentFee<0)throw new Error('Enter valid fee amounts.');
 if(professionalFee===inv.professionalFee&&governmentFee===inv.governmentFee)throw new Error('The amounts have not changed.');
 if(!String(reason||'').trim())throw new Error('Enter a reason for the change.');
 if((state.invoiceChanges||[]).some(x=>x.invoiceId===invoiceId&&x.status==='Pending'))throw new Error('This invoice already has a pending request.');
 const req={id:uid(),invoiceId,matterId:m.id,currency:m.currency,beforeProfessional:inv.professionalFee,beforeGovernment:inv.governmentFee,afterProfessional:professionalFee,afterGovernment:governmentFee,reason:String(reason).trim(),requestedBy:user.name,requestedAt:timestamp,status:'Pending'};
 (state.invoiceChanges??=[]).push(req);return req;
}
export function reviewInvoiceChange(state,requestId,decision,user,timestamp=new Date().toISOString()) {
 if(!user||user.status!=='Active'||user.role!=='Admin')throw new Error('Only admin can review invoice changes.');
 const req=(state.invoiceChanges||[]).find(x=>x.id===requestId);if(!req||req.status!=='Pending')throw new Error('Request is not pending.');
 if(!['Approved','Rejected'].includes(decision))throw new Error('Invalid decision.');
 const inv=state.invoices.find(x=>x.id===req.invoiceId),m=inv&&state.matters.find(x=>x.id===inv.matterId);if(!inv||!m)throw new Error('Invoice not found.');
 if(decision==='Approved'){
  if(inv.professionalFee!==req.beforeProfessional||inv.governmentFee!==req.beforeGovernment)throw new Error('Invoice changed since this request. Submit a new request.');
  const paid=state.installments.filter(i=>i.matterId===m.id).reduce((sum,i)=>sum+paidFor(state,i.id),0);
  if(req.afterProfessional+req.afterGovernment<paid)throw new Error('New total is less than approved net payments; review the refund first.');
  inv.professionalFee=req.afterProfessional;inv.governmentFee=req.afterGovernment;m.fee=req.afterProfessional;m.governmentFee=req.afterGovernment;
 }
 req.status=decision;req.reviewedBy=user.name;req.reviewedAt=timestamp;return req;
}
export function leadToClientData(lead, segment, country) {
 if(!lead||!['Bangladesh','NRB'].includes(segment))throw new Error('Select a valid client category.');
 const {id:leadId,ref:leadRef,status:leadStatus,...leadInformation}=lead;
 return {...leadInformation,name:lead.name||'',email:lead.email||'',phone:lead.phone||'',whatsapp:lead.whatsapp||'',profession:lead.profession||'',gender:lead.gender||'',country:country||lead.country||'',district:lead.district||'',city:lead.city||'',address:lead.address||'',service:lead.service||'',purpose:Array.isArray(lead.purpose)?[...lead.purpose]:(lead.purpose?[lead.purpose]:[]),source:lead.source||'',reference:lead.reference||'',segment,driveUrl:lead.driveUrl||'',note:lead.note||''};
}
export function clientCurrencyTotals(state, clientId) {
  const result={};
  for(const m of state.matters.filter(x=>x.clientId===clientId)) {
    result[m.currency]??={agreed:0,paid:0,scheduledBalance:0};
    const r=result[m.currency]; r.agreed+=(Number(m.fee)||0)+(Number(m.governmentFee)||0);
    for(const i of state.installments.filter(x=>x.matterId===m.id)) { r.paid+=paidFor(state,i.id); r.scheduledBalance+=remainingFor(state,i); }
  }
  for(const r of Object.values(result)) r.feeBalance=r.agreed-r.paid;
  return result;
}
export function seed(){const t=today(),d=n=>plusDays(t,n);return {
  inquiries:[
    {id:'in1',name:'Aisha Sample',email:'aisha@example.test',phone:'',service:'U.S. Immigration',channel:'Website',status:'New',date:d(-1),note:'Family immigration inquiry'},
    {id:'in2',name:'Rafi Sample',email:'rafi@example.test',phone:'',service:'Global Visa',channel:'WhatsApp',status:'New',date:d(-2),note:'Student visa inquiry'}
  ],
  leads:[
    {id:'l1',name:'Nadia Example',email:'nadia@example.test',phone:'',service:'U.S. Immigration',source:'Website',status:'Consultation',followup:d(1)},
    {id:'l2',name:'Tanvir Example',email:'tanvir@example.test',phone:'',service:'Bangladesh Law',source:'Referral',status:'New',followup:d(3)},
    {id:'l3',name:'Maya Example',email:'maya@example.test',phone:'',service:'Global Visa',source:'Messenger',status:'Follow-up',followup:d(5)}
  ],
  clients:[
    {id:'c1',ref:'CL-1001',name:'Sarah Example',email:'sarah@example.test',phone:'',country:'United States',segment:'NRB',driveUrl:'',note:'Fictional demo client'},
    {id:'c2',ref:'CL-1002',name:'Imran Example',email:'imran@example.test',phone:'',country:'Bangladesh',segment:'Bangladesh',driveUrl:'',note:'Fictional demo client'},
    {id:'c3',ref:'CL-1003',name:'Lina Example',email:'lina@example.test',phone:'',country:'Canada',segment:'NRB',driveUrl:'',note:'Fictional demo client'}
  ],
  matters:[
    {id:'m1',ref:'MRI-1001',clientId:'c1',title:'Family-based immigration',category:'U.S. Immigration',country:'United States',status:'In progress',assigned:'Case Manager',nextDate:d(3),currency:'USD',fee:350000,governmentFee:0},
    {id:'m2',ref:'MRI-1002',clientId:'c2',title:'Civil documentation',category:'Bangladesh Law',country:'Bangladesh',status:'Collecting documents',assigned:'Case Manager',nextDate:d(6),currency:'BDT',fee:4500000,governmentFee:0},
    {id:'m3',ref:'MRI-1003',clientId:'c3',title:'Visitor visa support',category:'Global Visa',country:'Canada',status:'Review',assigned:'Admin',nextDate:d(9),currency:'USD',fee:180000,governmentFee:0}
  ],
  tasks:[
    {id:'t1',title:'Follow up on consultation',related:'Nadia Example',dueDate:d(0),assigned:'Case Manager',done:false},
    {id:'t2',title:'Review supporting documents',related:'MRI-1001 · Sarah Example',dueDate:d(1),assigned:'Admin',done:false},
    {id:'t3',title:'Confirm next installment',related:'MRI-1002 · Imran Example',dueDate:d(3),assigned:'Accounts',done:false},
    {id:'t4',title:'Prepare case review',related:'MRI-1003 · Lina Example',dueDate:d(7),assigned:'Case Manager',done:false}
  ],
  installments:[
    {id:'i1',matterId:'m1',label:'Initial installment',amount:150000,dueDate:d(-7)},
    {id:'i2',matterId:'m1',label:'Second installment',amount:100000,dueDate:d(10)},
    {id:'i3',matterId:'m2',label:'First installment',amount:2000000,dueDate:d(3)},
    {id:'i4',matterId:'m3',label:'Initial installment',amount:90000,dueDate:d(-3)}
  ],
  payments:[
    {id:'p1',matterId:'m1',installmentId:'i1',amount:150000,method:'Bank transfer',date:d(-6),coverage:'Partial',status:'Approved'},
    {id:'p2',matterId:'m3',installmentId:'i4',amount:40000,method:'Bank transfer',date:d(-1),coverage:'Partial',status:'Pending'}
  ],
  team:[
    {id:'u1',name:'Firm Administrator',email:'admin@example.test',role:'Admin',status:'Active',permissions:['All sections']},
    {id:'u2',name:'Case Manager',email:'case@example.test',role:'Case Manager',status:'Active',permissions:['Leads','Clients','Matters','Tasks','USD accounts']},
    {id:'u3',name:'Accounts Team',email:'accounts@example.test',role:'Accounts',status:'Active',permissions:['Clients','Billing','BDT accounts']}
  ],
  paymentEvents:[],
  documentRequests:[],
  invoices:[],
  invoiceChanges:[],
  refunds:[],
  messages:[
    {id:'msg1',name:'Rafi Sample',channel:'WhatsApp',body:'Hello, I would like to ask about visa services. (Sample)',date:d(-2),status:'Unlinked'},
    {id:'msg2',name:'Maya Example',channel:'Messenger',body:'Please let me know about a consultation. (Sample)',date:d(-3),status:'Linked to lead'}
  ]
};}
export const stateCollections=['inquiries','leads','clients','matters','tasks','installments','payments','team','paymentEvents','documentRequests','invoices','invoiceChanges','refunds','messages','visaRecords'];
// Older or partially written browser data may lack newer collections; fill them so views never crash.
export function normalizeState(x){for(const k of stateCollections)if(!Array.isArray(x[k]))x[k]=k==='team'?seed().team:[];if(!x.team.length)x.team=seed().team;return x;}
export function loadState(storage){try{let raw=storage.getItem(storageKey);if(raw){let x=JSON.parse(raw);if(x && typeof x==='object' && Array.isArray(x.matters)&&Array.isArray(x.payments)) return normalizeState(x);}}catch{}return normalizeState(seed());}
// Section access mirrors the "Team & access" checkboxes. Admins see every section.
export const sectionPermissions={inquiries:['Inquiries','Leads'],leads:['Leads'],clients:['Clients'],matters:['Matters'],records:['Matters'],tasks:['Tasks'],billing:['Billing'],invoices:['Billing'],documents:['Clients'],communications:['Communications']};
export function mayAccessSection(user,section){
 if(!user||user.status!=='Active')return false;
 if(user.role==='Admin')return true;
 if(section==='team')return false;
 const required=sectionPermissions[section];
 return !required||required.some(p=>(user.permissions||[]).includes(p));
}
// Amount still available to schedule as installments; null when the matter has no agreed fee recorded.
export function remainingToSchedule(state,matterId){
 const m=state.matters.find(x=>x.id===matterId);if(!m)throw new Error('Matter not found.');
 const agreed=(Number(m.fee)||0)+(Number(m.governmentFee)||0);if(agreed<=0)return null;
 const scheduled=state.installments.filter(i=>i.matterId===matterId).reduce((n,i)=>n+(Number(i.amount)||0),0);
 return Math.max(0,agreed-scheduled);
}
// Fictional BDT sample data. Every sample payment is linked to an installment so all balances agree.
export function addSampleBdtTransactions(state,date=today()){
 for(let i=1;i<=3;i++){
  const cid=`sample-bdt-client-${i}`,mid=`sample-bdt-case-${i}`,iid=`sample-bdt-installment-${i}`;
  if(!state.clients.some(c=>c.id===cid))state.clients.push({id:cid,ref:`DEMO-BDT-${i}`,name:`Sample BDT Client ${i}`,country:'Bangladesh',segment:'Bangladesh',note:'Fictional sample'});
  if(!state.matters.some(m=>m.id===mid))state.matters.push({id:mid,clientId:cid,ref:`DEMO-BDT-CASE-${i}`,title:'Sample case',category:'Bangladesh Law',status:'In progress',currency:'BDT',fee:1000000,governmentFee:0});
  if(!state.installments.some(x=>x.id===iid))state.installments.push({id:iid,matterId:mid,number:1,label:'1st installment',amount:400000,dueDate:plusDays(date,-28)});
  for(let j=1;j<=4;j++){
   const id=`sample-bdt-payment-${i}-${j}`,existing=state.payments.find(p=>p.id===id);
   if(existing){if(!existing.installmentId)existing.installmentId=iid;continue;}
   state.payments.push({id,matterId:mid,installmentId:iid,amount:100000,method:j%2?'Bank transfer':'Cash',date:plusDays(date,-j*7),coverage:'Partial',status:'Approved'});
  }
 }
 return state;
}
export function saveState(storage,state){storage.setItem(storageKey,JSON.stringify(state));}
