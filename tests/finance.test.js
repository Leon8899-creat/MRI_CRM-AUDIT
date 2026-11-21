import test from 'node:test';
import assert from 'node:assert/strict';
import {toCents, paidFor, remainingFor, installmentStatus, approvePayment, totalsByCurrency} from '../dist/model.js';
function ledger(){return {matters:[{id:'a',currency:'USD'},{id:'b',currency:'BDT'}],installments:[{id:'ia',matterId:'a',amount:100000,dueDate:'2026-10-25'},{id:'ib',matterId:'b',amount:500000,dueDate:'2026-11-01'}],payments:[{id:'p1',installmentId:'ia',matterId:'a',amount:20000,status:'Approved'},{id:'p2',installmentId:'ia',matterId:'a',amount:30000,status:'Pending'},{id:'p3',installmentId:'ib',matterId:'b',amount:100000,status:'Approved'}]}}
test('amounts convert to minor units accurately and reject invalid precision',()=>{assert.equal(toCents('123.45'),12345);assert.equal(toCents('1.2'),120);assert.throws(()=>toCents('1.234'));assert.throws(()=>toCents('-1'));});
test('pending payment does not reduce a balance until approved',()=>{let s=ledger(),i=s.installments[0];assert.equal(paidFor(s,'ia'),20000);assert.equal(remainingFor(s,i),80000);assert.equal(installmentStatus(s,i,'2026-10-26'),'Overdue');approvePayment(s,'p2');assert.equal(remainingFor(s,i),50000);assert.equal(s.payments[1].status,'Approved')});
test('approval rejects overpayment and duplicate approval',()=>{let s=ledger();s.payments[1].amount=90000;assert.throws(()=>approvePayment(s,'p2'),/exceeds/);s.payments[1].amount=80000;approvePayment(s,'p2');assert.equal(installmentStatus(s,s.installments[0],'2026-10-26'),'Paid');assert.throws(()=>approvePayment(s,'p2'),/not pending/)});
test('totals keep USD and BDT completely separate',()=>{let t=totalsByCurrency(ledger());assert.deepEqual(t.USD,{scheduled:100000,paid:20000,balance:80000});assert.deepEqual(t.BDT,{scheduled:500000,paid:100000,balance:400000})});
test('client finance stays separated by currency across multiple matters',async()=>{
 const {clientCurrencyTotals}=await import('../dist/model.js');
 const s=ledger();s.matters[0].clientId='same';s.matters[0].fee=150000;s.matters[0].governmentFee=10000;s.matters[1].clientId='same';s.matters[1].fee=1000000;s.matters[1].governmentFee=0;
 assert.deepEqual(clientCurrencyTotals(s,'same'),{USD:{agreed:160000,paid:20000,scheduledBalance:80000,feeBalance:140000},BDT:{agreed:1000000,paid:100000,scheduledBalance:400000,feeBalance:900000}});
 assert.deepEqual(clientCurrencyTotals(s,'other'),{});
});
test('a 5,000 BDT fee paid 2,000 leaves a 3,000 BDT fee balance',async()=>{
 const {clientCurrencyTotals}=await import('../dist/model.js');
 const s={matters:[{id:'m',clientId:'c',currency:'BDT',fee:500000,governmentFee:0}],installments:[{id:'i',matterId:'m',amount:200000,dueDate:'2026-11-01'}],payments:[{id:'p',matterId:'m',installmentId:'i',amount:200000,status:'Approved'}]};
 assert.equal(clientCurrencyTotals(s,'c').BDT.feeBalance,300000);
});
test('amount edit requires granted currency and edit permissions and records before/after and actor',async()=>{
 const {editPaymentAmount,mayViewCurrency}=await import('../dist/model.js');
 const s=ledger();s.payments[2].status='Pending';const associate={id:'u',name:'Associate Example',role:'Staff',status:'Active',permissions:['BDT accounts']};
 assert.equal(mayViewCurrency(associate,'USD'),false);assert.equal(mayViewCurrency(associate,'BDT'),true);
 assert.throws(()=>editPaymentAmount(s,'p3',200000,associate,'2026-10-26T20:00:00Z'),/Admin must grant/);
 assert.equal(s.payments[2].amount,100000);associate.permissions.push('Edit amounts');
 editPaymentAmount(s,'p3',200000,associate,'2026-10-26T20:00:00Z');
 assert.equal(s.payments[2].amount,200000);assert.equal(s.paymentEvents.length,1);
 assert.deepEqual([s.paymentEvents[0].oldAmount,s.paymentEvents[0].newAmount,s.paymentEvents[0].actorName,s.paymentEvents[0].changedAt],[100000,200000,'Associate Example','2026-10-26T20:00:00Z']);
 associate.status='Disabled';assert.throws(()=>editPaymentAmount(s,'p3',150000,associate),/Admin must grant/);assert.equal(s.paymentEvents.length,1);
});
test('payment details are locked until granted, and each changed field is recorded',async()=>{
 const {editPaymentDetails}=await import('../dist/model.js');
 const s=ledger();s.payments[2].status='Pending';s.payments[2].date='2026-10-01';s.payments[2].method='Cash';s.payments[2].coverage='Partial';
 const u={id:'u2',name:'Case Staff',role:'Staff',status:'Active',permissions:['BDT accounts']};
 const update={date:'2026-10-04',method:'Online payment',coverage:'Full'};
 assert.throws(()=>editPaymentDetails(s,'p3',update,u,'2026-10-26T21:00:00Z'),/Admin must grant/);
 assert.equal(s.payments[2].method,'Cash');u.permissions.push('Edit payment details');
 editPaymentDetails(s,'p3',update,u,'2026-10-26T21:00:00Z');
 assert.deepEqual(s.paymentEvents.map(e=>[e.field,e.oldValue,e.newValue,e.actorName]),[['Payment date','2026-10-01','2026-10-04','Case Staff'],['Partial / Full','Partial','Full','Case Staff'],['Mode of payment','Cash','Online payment','Case Staff']]);
});
test('partial payment, paid and refund statuses follow approved net payments',async()=>{
 const {invoiceStatus,approveRefund,refundedForPayment}=await import('../dist/model.js');
 const s={matters:[{id:'m',currency:'BDT'}],installments:[{id:'i',matterId:'m',amount:500000,dueDate:'2026-11-01'}],payments:[{id:'p',matterId:'m',installmentId:'i',amount:500000,status:'Approved'}],refunds:[{id:'r',paymentId:'p',matterId:'m',amount:200000,status:'Pending'}]};
 assert.equal(invoiceStatus(500000,paidFor(s,'i'),refundedForPayment(s,'p')),'PAID');
 approveRefund(s,'r');assert.equal(paidFor(s,'i'),300000);assert.equal(remainingFor(s,s.installments[0]),200000);assert.equal(invoiceStatus(500000,paidFor(s,'i'),refundedForPayment(s,'p')),'PARTIAL PAYMENT');
 s.refunds.push({id:'r2',paymentId:'p',matterId:'m',amount:300000,status:'Pending'});approveRefund(s,'r2');assert.equal(invoiceStatus(500000,paidFor(s,'i'),refundedForPayment(s,'p')),'REFUNDED');
 s.refunds.push({id:'r3',paymentId:'p',matterId:'m',amount:1,status:'Pending'});assert.throws(()=>approveRefund(s,'r3'),/exceeds/);
});
test('invoice fee changes require permission and admin approval and keep a history',async()=>{
 const {requestInvoiceChange,reviewInvoiceChange}=await import('../dist/model.js');
 const s={matters:[{id:'m',currency:'BDT',fee:500000,governmentFee:0}],invoices:[{id:'inv',matterId:'m',professionalFee:500000,governmentFee:0}],installments:[{id:'i',matterId:'m',amount:200000}],payments:[{id:'p',matterId:'m',installmentId:'i',amount:200000,status:'Approved'}],invoiceChanges:[]};
 const staff={id:'u',name:'Associate',status:'Active',role:'Staff',permissions:['BDT accounts']};const admin={id:'a',name:'Admin',status:'Active',role:'Admin',permissions:[]};
 assert.throws(()=>requestInvoiceChange(s,'inv',600000,0,'Correction',staff),/grant/);staff.permissions.push('Request invoice changes');
 const request=requestInvoiceChange(s,'inv',600000,0,'Correction',staff,'2026-10-26T20:00:00Z');assert.equal(s.invoices[0].professionalFee,500000);
 assert.throws(()=>reviewInvoiceChange(s,request.id,'Approved',staff),/Only admin/);reviewInvoiceChange(s,request.id,'Approved',admin,'2026-10-26T21:00:00Z');
 assert.equal(s.invoices[0].professionalFee,600000);assert.equal(s.matters[0].fee,600000);assert.equal(request.beforeProfessional,500000);assert.equal(request.afterProfessional,600000);assert.equal(request.requestedBy,'Associate');assert.equal(request.reviewedBy,'Admin');assert.equal(request.status,'Approved');
});
test('invoice changes cannot reduce total below approved net payments',async()=>{
 const {requestInvoiceChange,reviewInvoiceChange}=await import('../dist/model.js');const admin={id:'a',name:'Admin',status:'Active',role:'Admin'};
 const s={matters:[{id:'m',currency:'USD',fee:50000,governmentFee:0}],invoices:[{id:'v',matterId:'m',professionalFee:50000,governmentFee:0}],installments:[{id:'i',matterId:'m',amount:40000}],payments:[{id:'p',installmentId:'i',matterId:'m',status:'Approved',amount:40000}],invoiceChanges:[]};
 const r=requestInvoiceChange(s,'v',30000,0,'Correction',admin);assert.throws(()=>reviewInvoiceChange(s,r.id,'Approved',admin),/less than approved/);assert.equal(s.invoices[0].professionalFee,50000);assert.equal(r.status,'Pending');
});
test('installments continue beyond sixth and retain correct ordinal labels',async()=>{
 const {ordinal,nextInstallmentNumber}=await import('../dist/model.js');
 assert.equal(ordinal(10),'10th');assert.equal(ordinal(11),'11th');assert.equal(ordinal(21),'21st');
 const s={installments:[{matterId:'m',label:'First installment'},{matterId:'m',label:'9th installment'},{matterId:'other',label:'25th installment'}]};
 assert.equal(nextInstallmentNumber(s,'m'),10);assert.equal(nextInstallmentNumber(s,'new'),1);
});
test('lead conversion preserves contact and location without lead identifiers',async()=>{
 const {leadToClientData}=await import('../dist/model.js');
 const lead={id:'lead-1',ref:'LEAD-123',name:'Sample',email:'s@example.test',phone:'1',whatsapp:'2',profession:'Teacher',gender:'Female',country:'Canada',district:'Ontario',city:'Toronto',address:'Sample Road',reference:'Referral',source:'Website'};
 const c=leadToClientData(lead,'NRB','');assert.deepEqual([c.sourceLeadRef,c.sourceLeadId,c.reference,c.name,c.whatsapp,c.profession,c.gender,c.country,c.district,c.city,c.address],[undefined,undefined,'Referral','Sample','2','Teacher','Female','Canada','Ontario','Toronto','Sample Road']);
 assert.throws(()=>leadToClientData(lead,'',''),/category/);
});

test('approved payment edits require an active admin even with staff grants',async()=>{const {editPaymentAmount,editPaymentDetails}=await import('../dist/model.js');const s=ledger(),staff={id:'u',name:'Staff',status:'Active',role:'Staff',permissions:['BDT accounts','Edit amounts','Edit payment details']},admin={id:'a',name:'Admin',status:'Active',role:'Admin'};assert.throws(()=>editPaymentAmount(s,'p3',200000,staff),/Only an admin/);assert.throws(()=>editPaymentDetails(s,'p3',{date:'2026-10-01',coverage:'Full',method:'Cash'},staff),/Only an admin/);editPaymentAmount(s,'p3',200000,admin);assert.equal(s.paymentEvents[0].actorName,'Admin');});
