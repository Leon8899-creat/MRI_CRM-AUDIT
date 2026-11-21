# CRM backend starter — NOT READY FOR REAL CLIENT DATA

This source prepares an API that can run on the firm's own Node.js server and use a firm-controlled Firebase Authentication and Cloud Firestore project. It is a starting point for the next phase, not a finished or deployed production service. The demo UI does not yet call this API.

Implemented in this starter: verified Firebase ID-token checks, active-user lookup on every request, owner-only team configuration, case assignments, per-currency billing access, separate amount/detail edit grants, payment and refund approval transactions, and server-created audit events. Firestore client reads/writes are denied by the included rules; API access uses the Admin SDK.

Code layout: `app.js` builds the Express API through `createApp({db, auth, FieldValue, ownerEmail})`; `server.js` connects it to real Firebase (Admin SDK + Application Default Credentials) and exits with a clear message if `FIREBASE_PROJECT_ID` or `CRM_OWNER_EMAIL` is missing. Endpoints: `/api/me`, `/api/team`, `/api/clients`, `/api/matters`, `/api/matters/:id/{installments,payments,refunds,audit}`, `/api/installments` (total capped at the agreed fees), `/api/payments` (+ `approve`, `reject`, `PATCH` corrections), `/api/refunds` (+ `approve`).

Not implemented: production UI integration, invoice and fee-change-request endpoints, invoice generation on the server, durable reminder delivery, document upload portal, Google Drive folder creation or upload, Gmail/other mail delivery, WhatsApp/Messenger integration, backup/restore automation, or configuration and end-to-end deployment. The starter has not been tested against a real Firebase project or Firebase Emulator. Its security and concurrency require independent end-to-end verification before any real legal, financial, or client records are used.

## Local preparation on an administrator-controlled server

1. Install a supported Node.js runtime and install the dependencies from `package.json` using the official npm registry. On Windows/Plesk/IIS, use a service manager and a TLS reverse proxy; this API listens on `127.0.0.1` only.
2. Use a firm-controlled Firebase/Google Cloud project with Firebase Authentication, a Google sign-in provider, and Cloud Firestore. Grant the server identity only the required permissions. Configure Application Default Credentials or another supported server credential mechanism; never embed service-account keys in client-side code.
3. Set `FIREBASE_PROJECT_ID`, `CRM_OWNER_EMAIL`, and optionally `PORT` in the server's protected environment. The verified owner email bootstraps the first administrator. The owner can subsequently grant and disable team users via the team API.
4. Deploy `firestore.rules` to the correct Firebase project and verify they deny direct browser access. The backend uses the Firebase Admin SDK, which bypasses Firestore security rules; the backend's own access checks are therefore essential.
5. Integrate a Firebase web sign-in with the actual client UI and securely send ID tokens to this API over TLS. The current demo's browser role selector is not real authentication.
6. Run Firebase Emulator integration tests for authorization, disable/revoke behavior, concurrent payments/refunds, data isolation, idempotency, audit, and backup restore. Configure production monitoring, rate limits, secure headers, retention, and independent security review.

`npm test` (or `node --test test/*.test.js`) checks the authorization and validation logic and exercises every route over HTTP against an in-memory Firestore/Auth fake (`test/fake-firestore.js`), which also enforces Firestore's reads-before-writes transaction rule. It does not test real Firebase Auth token verification, real Firestore transaction contention, deployment, the web UI, Drive, or email. Rate limiting is not implemented; put the API behind a reverse proxy that limits requests.

The user may host the application on their own server while Firebase Authentication and Firestore remain cloud services. Google Drive and an authorized email service must be separately connected. No actual emails or refunds are sent or transferred by this starter.
