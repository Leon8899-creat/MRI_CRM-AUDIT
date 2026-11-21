# M. R. I. Chowdhury & Associates — CRM prototype

This is an interactive, fictional-data prototype for the firm. It demonstrates inquiry to lead to client conversion, matters in three service areas, due dates, flexible automatically numbered installment schedules, payment approval, refunds, sample invoices with status stamps and admin-reviewed fee change requests, manually selected Bangladesh/NRB categories with currency-specific balances, mock access controls, payment edit history, draft document requests and a proposed communications inbox.

## Run locally

Requires Node 20 or newer. Run `npm start`, then open `http://localhost:3000`. No packages are required. `PORT` and `HOST` (default `0.0.0.0`, which is reachable from your network; use `HOST=127.0.0.1` to keep it local) can be set in the environment. The server can be started from any directory. The frontend can also be served as static files from `dist/`.

`npm test` runs the finance/model checks and the static-server tests. `npm run test:backend` runs the backend starter's tests (run `npm install` in `backend/` first). See `AUDIT_REPORT.md` for the latest audit and test results.

## Integration status

| Area | Status |
| --- | --- |
| Leads, clients, cases, tasks, installments, payments, refunds, invoices, fee change requests | Working in the browser demo (localStorage, one browser only) |
| Roles and section permissions | Simulated in the browser: the preview selector switches users and the Team & access section checkboxes now hide sections and billing actions. Not a security boundary |
| Firebase Authentication / Firestore | Backend starter only. Route logic is tested against an in-memory fake; **not** connected to the UI and **not** tested against a real Firebase project or the Emulator |
| Google Drive | Demo only: a manually typed `drive.google.com` link is stored and opened. No OAuth, upload, or folder creation |
| WhatsApp / Messenger / website intake | Demo only: sample cards and messages. Nothing is received or sent |
| Reminders / notifications | Demo only: dates are displayed; no email, SMS, push or WhatsApp delivery |
| Accounting reports | Demo ledger in browser storage; classifications are manual |

## Important current limits

- Prototype only: data is stored in each browser's localStorage. The role selector and permission checks simulate behavior in the browser only; they are not a security boundary and can be bypassed. Do not use real client, case, financial, or privileged information.
- The separate `backend/` directory contains an unconnected server-side starter for Firebase authentication, Firestore, permissions, and payment/refund handling. Its routes are covered by automated tests that use an in-memory Firestore fake, but it has not been integrated with the demo or tested against a real Firebase project. Production security, account revocation, backups, and deployment are not complete.
- Drive folder links are manually entered; OAuth, document upload, automated folder creation and Drive permissions are not implemented. Opening a Drive link is still governed by the viewer's actual Google permissions.
- Website intake, WhatsApp and Messenger cards are demonstrations only. No webhooks, message synchronization, outbound messages, or Meta permissions are connected.
- Follow-ups and dates display in the prototype, but no scheduled email, push, SMS, or WhatsApp alerts are sent.
- This is an installment tracker, not a full accounting system. Cash, cheque, bank transfer and online payment identify how an existing payment was received; no online payment processing or client trust ledger is implemented. Payment audit history can be altered in browser storage and is not a secure audit trail.
- Never accept real data until a qualified review of access control, confidentiality, backup/restore, and message/document security is completed.

## Intended next development stages

1. Confirm required users, section-level and case-level access, jurisdictions, practice-specific case data, fee categories, and initial workflows.
2. Implement Google sign-in with a firm-controlled Firebase project. Enforce authorized users and permissions in server-side services and Firestore security rules. Record auditable changes; define and test backup/restore. Implement safe revocation for both CRM and separately shared Drive files.
3. Store case and client records in Firestore and connect case/client folders in a firm-controlled Google Shared Drive. Design Drive permissions so they match case access; a link alone is not a permission system.
4. Add a reliable server-side scheduler and delivery tracking for reminders. Define timezone and manually entered deadlines; do not assume generated deadlines are correct.
5. Integrate the firm's authorized WhatsApp Business Platform number and Facebook Page via Meta-supported APIs and verified webhooks. Enforce webhook signatures and role access, securely store tokens, deduplicate events, handle delivery failures, and follow current Meta messaging policies. Eligibility for using the same number alongside the WhatsApp Business mobile app must be checked.
6. Add the firm's invoice/receipt, approval, expense, and reconciliation requirements; assess any client funds/trust accounting requirements separately before building those features.
7. Test permissions, financial calculations, backup restore, messaging, and mobile layouts with fictional records before any real deployment.

The source files can be used as a starting point for development in a JavaScript-capable environment, including as context for an AI Studio build. Import and deployment capabilities depend on the current AI Studio interface. Hosting and integrations may incur charges.

## Own-server hosting

The demo source can be served with Node.js on a server you control. The backend starter is designed to run on that server while Firebase Authentication and Firestore remain Google cloud services. Configure and test the complete integration before deploying any production CRM. See `backend/README.md`.
