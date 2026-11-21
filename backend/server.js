/* Starter server: not connected to the demo UI or deployed. Review and test with
 * Firebase Emulator and the firm's production security process before use. */
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createApp} from './app.js';

const projectId=process.env.FIREBASE_PROJECT_ID,ownerEmail=process.env.CRM_OWNER_EMAIL,port=Number(process.env.PORT||3000);
const missing=[!projectId&&'FIREBASE_PROJECT_ID',!ownerEmail&&'CRM_OWNER_EMAIL'].filter(Boolean);
if(missing.length){console.error(`Missing required environment variable(s): ${missing.join(', ')}. See backend/README.md.`);process.exit(1);}
if(!Number.isInteger(port)||port<=0||port>=65536){console.error('PORT must be an integer between 1 and 65535.');process.exit(1);}

initializeApp({credential:applicationDefault(),projectId});
const app=createApp({db:getFirestore(),auth:getAuth(),FieldValue,ownerEmail});
app.listen(port,'127.0.0.1',()=>console.log(`CRM API listening on local port ${port}`));
