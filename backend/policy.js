export class PolicyError extends Error { constructor(message,status=403){super(message);this.status=status;} }
export function ensure(condition,message,status=403){if(!condition)throw new PolicyError(message,status)}
export function normalizeEmail(email){const v=String(email||'').trim().toLowerCase();ensure(v.length<=254 && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v),'Invalid email.',400);return v;}
export function id(value){const v=String(value||'');ensure(/^[A-Za-z0-9_-]{1,128}$/.test(v),'Invalid identifier.',400);return v;}
export function text(value,name,max=160){const s=String(value||'').trim();ensure(s.length>0&&s.length<=max,`Invalid ${name}.`,400);return s;}
export function date(value){const s=String(value||'');ensure(/^\d{4}-\d{2}-\d{2}$/.test(s),'Invalid date.',400);const d=new Date(s+'T00:00:00Z');ensure(!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s,'Invalid date.',400);return s;}
export function amount(value){ensure(Number.isSafeInteger(value)&&value>0&&value<=1000000000000,'Amount must be a positive integer in minor units.',400);return value;}
export function positiveOrZero(value){ensure(Number.isSafeInteger(value)&&value>=0&&value<=1000000000000,'Invalid fee in minor units.',400);return value;}
export const currencyList=['USD','BDT','CAD','EUR','GBP','AUD'];
export const methods=['Cash','Cheque','Bank transfer','Online payment','Card','Other'];
export const labels=['First installment','Second installment','Third installment','Fourth installment','Fifth installment','Sixth installment','Final installment'];
export function installmentLabel(v){if(labels.includes(v))return v;const m=String(v||'').match(/^(\d+)(st|nd|rd|th) installment(?: \(final\))?$/);ensure(m,'Invalid installment.',400);const n=Number(m[1]),mod=n%100,suffix=(mod>=11&&mod<=13)?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th');ensure(Number.isSafeInteger(n)&&n>0&&m[2]===suffix,'Invalid installment.',400);return v;}
export function oneOf(value,values,name){ensure(values.includes(value),`Invalid ${name}.`,400);return value;}
export function active(user){ensure(user&&user.status==='Active','Your account is not active.');return user;}
export function isAdmin(user){return active(user).role==='Admin';}
export function has(user,permission){return isAdmin(user)||(Array.isArray(user.permissions)&&user.permissions.includes(permission));}
export function canCurrency(user,currency){if(isAdmin(user))return true;const permission=currency==='USD'?'USD accounts':currency==='BDT'?'BDT accounts':'Other currency accounts';return has(user,permission);}
export function authorizeCase(user,matter){ensure(matter,'Matter not found.',404);ensure(isAdmin(user)||(Array.isArray(matter.assignedEmails)&&matter.assignedEmails.includes(user.email)),'Matter is not assigned to you.');return matter;}
export function authorizePayment(user,matter,action='Billing'){authorizeCase(user,matter);ensure(has(user,'Billing'),'Billing permission required.');ensure(canCurrency(user,matter.currency),'Currency permission required.');if(action!=='Billing')ensure(has(user,action),'Payment edit permission required.');}
export function validateCorrection(user,matter,payment,installment,patch){
 authorizePayment(user,matter);if(payment.status==='Approved')ensure(isAdmin(user),'Only an admin can correct an approved payment.');ensure(payment.status!=='Rejected','Rejected payment cannot be edited.',400);
 const allowed=['amountCents','date','coverage','method'];ensure(Object.keys(patch).length>0&&Object.keys(patch).every(k=>allowed.includes(k)),'Invalid correction fields.',400);
 const changes={};
 for(const [key,v] of Object.entries(patch)){
  if(key==='amountCents'){ensure(has(user,'Edit amounts'),'Amount edit permission required.');amount(v);ensure(v>=(payment.refundedApprovedCents||0),'Amount is lower than an approved refund.',400);
   const delta=payment.status==='Approved'?v-payment.amountCents:v;ensure((installment.paidApprovedCents||0)+delta<=installment.amountCents,'Amount exceeds installment.',400);
  }else{ensure(has(user,'Edit payment details'),'Payment detail edit permission required.');if(key==='date')date(v);if(key==='coverage')oneOf(v,['Partial','Full'],'coverage');if(key==='method')oneOf(v,methods,'payment method');}
  if(payment[key]!==v)changes[key]={before:payment[key]??null,after:v};
 }
 ensure(Object.keys(changes).length>0,'No values changed.',400);return changes;
}
