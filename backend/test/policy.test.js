import test from 'node:test';
import assert from 'node:assert/strict';
import {canCurrency,authorizePayment,validateCorrection,date,amount} from '../policy.js';
const staff={email:'staff@example.test',status:'Active',role:'Staff',permissions:['Billing','BDT accounts']};
const matter={currency:'BDT',assignedEmails:['staff@example.test']};
const payment={status:'Pending',amountCents:200000,refundedApprovedCents:0,date:'2026-10-01',method:'Cash',coverage:'Partial'};
const installment={amountCents:500000,paidApprovedCents:200000};
test('staff only sees explicitly granted currencies and assigned cases',()=>{assert.equal(canCurrency(staff,'BDT'),true);assert.equal(canCurrency(staff,'USD'),false);assert.doesNotThrow(()=>authorizePayment(staff,matter));assert.throws(()=>authorizePayment(staff,{...matter,assignedEmails:[]}));assert.throws(()=>authorizePayment(staff,{...matter,currency:'USD'}));});
test('payment details and amounts stay locked without independent grants',()=>{assert.throws(()=>validateCorrection(staff,matter,payment,installment,{amountCents:210000}),/Amount edit permission/);assert.throws(()=>validateCorrection(staff,matter,payment,installment,{method:'Online payment'}),/detail edit permission/);});
test('explicit amount permission allows auditable changes but not overpayment',()=>{const user={...staff,permissions:[...staff.permissions,'Edit amounts']};assert.deepEqual(validateCorrection(user,matter,payment,installment,{amountCents:210000}),{amountCents:{before:200000,after:210000}});assert.throws(()=>validateCorrection(user,matter,payment,installment,{amountCents:510000}),/exceeds/);});
test('revoked users, invalid dates and invalid money are rejected',()=>{assert.throws(()=>canCurrency({...staff,status:'Disabled'},'BDT'));assert.throws(()=>date('2026-02-30'));assert.throws(()=>amount(1.1));});
test('server accepts numbered installments beyond six and rejects invalid ordinals',async()=>{const {installmentLabel}=await import('../policy.js');assert.equal(installmentLabel('10th installment'),'10th installment');assert.equal(installmentLabel('21st installment (final)'),'21st installment (final)');assert.throws(()=>installmentLabel('21th installment'));});

test('approved payments can only be corrected by an admin',()=>{const approved={...payment,status:'Approved'};const granted={...staff,permissions:[...staff.permissions,'Edit amounts']};assert.throws(()=>validateCorrection(granted,matter,approved,installment,{amountCents:210000}),/Only an admin/);const admin={email:'admin@example.test',status:'Active',role:'Admin'};assert.deepEqual(validateCorrection(admin,matter,approved,installment,{amountCents:210000}),{amountCents:{before:200000,after:210000}});});
