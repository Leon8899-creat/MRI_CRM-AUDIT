# CRM audit report: M. R. I. Chowdhury & Associates

Date: 2026-11-21. Scope: the whole repository (`server.js`, `dist/` frontend, `tests/`, `backend/` starter, READMEs). The project was audited and fixed in place. The UI design, the architecture and all existing features were kept.

## 1. Architecture (as found)

| Part | What it is |
| --- | --- |
| `server.js` | Zero-dependency Node static file server for `dist/` |
| `dist/app.js` | Single-page app (vanilla JS, about 155 KB minified). All screens, forms and handlers. State lives in `localStorage` |
| `dist/model.js` | Pure business rules: money in minor units, installments, payment and refund approval, invoice change requests, permissions, seed data |
| `dist/accounting.js` | Admin-only demo ledger (journal, income statement, balance sheet, general ledger) in `localStorage` |
| `backend/` | Express + firebase-admin API starter (`policy.js` rules, Firestore transactions, audit events). **Not connected to the UI** |
| `tests/finance.test.js`, `backend/test/policy.test.js` | Existing unit tests (14 + 6, all passing before changes) |

The frontend never calls the backend. "Roles" are a preview selector in the browser.

## 2. Findings by priority, and what happened to each

Status: **Fixed** means changed and verified by an automated test and/or in the running app (section 4). **Open** means not changed; the reason is given.

### Critical
None. No secrets, credentials or API keys are in the repository. Nothing in the demo talks to an external service.

### High
| # | Finding | Status |
| --- | --- | --- |
| H1 | Section permissions from Team & access (`Billing`, `Leads`, `Clients`, `Matters`, `Tasks`, `Communications`, `Inquiries`) were saved but **never checked**. Any team member could open any section and record installments, payments and refunds. For example, the seeded Case Manager has no Billing grant but could record payments | **Fixed**: `mayAccessSection()` in `model.js`. The nav hides sections the user cannot open, dashboard links and direct navigation are blocked with a message, billing forms require Billing, and switching the preview user away from a forbidden page returns to Overview |
| H2 | If `localStorage` refused a save (quota is about 5 MB, easily reached with sample images), the in-memory state was already changed. The screen showed data that disappeared on reload. In click handlers the error was uncaught | **Fixed**: `save()` rolls back to the last saved copy, re-renders, closes any open form and shows "Not saved: browser storage is full…" |
| H3 | "Add sample BDT transactions" created 12 *approved* payments with **no installment**. Client fee balances and installment totals showed 0 paid while invoices counted them. Editing these payments failed with "Payment or installment not found" | **Fixed**: `addSampleBdtTransactions()` creates a linked installment per sample case and repairs payments saved by the old version |
| H4 | `server.js` resolved `dist` relative to the *current shell directory*. Starting it from any other folder served 404 for every page | **Fixed**: resolved from the file's own location |
| H5 | `dist/firm-crm-demo-source.zip` (Settings → "Download demo source") was an older, different version of the code (Oct 27, app.js 79 KB vs 155 KB) | **Fixed**: rebuilt from the current source |
| H6 | Backend had no way to run or test without a live Firebase project. Route logic and Firestore transaction ordering had never been exercised | **Fixed**: split into `app.js` (`createApp` with injected Firestore/Auth) and `server.js` (real Firebase bootstrap). Added HTTP route tests with an in-memory Firestore fake that enforces reads-before-writes |
| H7 | Backend had endpoints to create installments and refunds but **none to list them**, so no client could show a schedule or refund history | **Fixed**: `GET /api/matters/:id/installments` and `GET /api/matters/:id/refunds`, with the same case and currency authorization as payments |

### Medium
| # | Finding | Status |
| --- | --- | --- |
| M1 | Installments could be scheduled above the agreed professional + government fee (frontend and backend) | **Fixed** in both. Frontend shows "Remaining to schedule". Backend returns 400. Matters with no agreed fee recorded are not capped (see open items) |
| M2 | Backend returned **500** for malformed JSON and an Express HTML page for unknown `/api` routes | **Fixed**: JSON 400/413/404 responses. 500s are now logged server-side (still a generic message to the client) |
| M3 | Backend required a client email; the UI treats it as optional | **Fixed**: validated only when provided |
| M4 | Backend allowed refund dates before the original payment | **Fixed** |
| M5 | Team & access labelled the *first row shown* as "Owner". Searching hid the real owner, mislabelled another member and removed their Manage button | **Fixed**: based on the owner's id |
| M6 | "Reset demo" merged seed data over old state: visa records, the finance-visibility setting and accounting classifications survived, and the selected user could point at a deleted member | **Fixed**: full replacement, preview user reset to the owner |
| M7 | `loadState()` accepted stored data missing newer collections (e.g. `inquiries`, `tasks`), which crashes rendering | **Fixed**: `normalizeState()` |
| M8 | Switching from Admin to a non-admin while viewing an accounting report left a blank page | **Fixed** |
| M9 | Converting a lead deleted it, leaving its tasks pointing at nothing | **Fixed**: tasks are relinked to the new client |
| M10 | "Move back to Lead" said client-only information would not transfer, but NID, passport, payment draft and category did | **Fixed** |
| M11 | Static server sent no security headers and answered every HTTP method | **Fixed**: CSP, `X-Frame-Options`, `Referrer-Policy`, `nosniff`; non-GET/HEAD → 405; malformed URL → 400 |
| M12 | Accounting module wrote to `localStorage` without error handling (uncaught on quota). Journal entries accepted a blank description | **Fixed** |

### Low
| # | Finding | Status |
| --- | --- | --- |
| L1 | Stray `}` printed in the accounting "Accounting status" column | **Fixed** |
| L2 | New case did not verify the selected client exists. Duplicate-reference check crashed on a matter without a reference | **Fixed** |
| L3 | "Open sample PDF" links used `data:` URLs, which browsers block from opening in a new tab | **Fixed**: opened through a temporary blob URL. The code path is in place, but opening an actual PDF was not exercised in the browser |
| L4 | `matter_created` audit event lacked `matterId`, so it never appeared in the matter's audit trail | **Fixed** |
| L5 | Backend startup error for a missing owner email was "Invalid email." | **Fixed**: names the missing variables |
| L6 | Cache-busting query strings bumped so browsers load the fixed modules | **Fixed** |

## 3. Integrations: working vs demo-only

| Integration | Verdict | What is needed to make it real |
| --- | --- | --- |
| Firebase Authentication | **Not connected.** Backend verifies ID tokens with `verifyIdToken(token, true)`; tested only with a fake | Firm-controlled Firebase project ID, Google sign-in provider enabled, Firebase *web* config for a sign-in page in the UI, `CRM_OWNER_EMAIL`, server credentials via Application Default Credentials (never in the browser) |
| Cloud Firestore | **Not connected.** Rules deny all client access (correct, the API uses the Admin SDK) | Same project. Deploy `backend/firestore.rules`. Run Emulator tests (needs Java + `firebase-tools`) |
| Google Drive | **Demo only**: a typed `https://drive.google.com/...` link is validated, stored and opened | Google Cloud OAuth client / service account, a Shared Drive, a folder-per-client design matching case access |
| WhatsApp Business | **Demo only**: static cards and sample messages | Meta app, WhatsApp Business Platform phone number ID, system-user access token, webhook verify token and app secret (signature checks), a public HTTPS webhook URL |
| Facebook Messenger | **Demo only** | Facebook Page, Page access token with messaging permissions, webhook as above |
| Reminders | **Demo only**: dates and alerts display, nothing is sent | A server-side scheduler plus an email/SMS/WhatsApp provider account |
| Website intake | **Demo only**: inquiries are typed in manually | A form endpoint on the backend with spam protection |

No integration was faked with mock data; the existing demo labels ("Not connected", "Demo only") were kept.

## 4. Testing performed

**Automated: all passing**
- `npm test`: 20 tests. 14 original finance tests (unchanged) plus `tests/model.test.js` (state normalization, section permissions, fee cap, linked sample transactions, refund guard) and `tests/server.test.js` (serves `dist` regardless of cwd, security headers, path traversal attempts never served, 404/400/405).
- `npm run test:backend`: 10 tests. 6 original policy tests plus `backend/test/api.test.js`, which runs every route over HTTP: authentication (missing, invalid or unverified token), owner bootstrap, team management and disabling, currency and assignment limits, fee cap, payment idempotency, overpayment, admin-only approval, approved-payment correction, refund limits and approval balances, audit trail, malformed JSON, unknown routes.
- `backend/server.js` was started with the real `firebase-admin` package: it exits with a clear message when the variables are missing, and starts listening when they are set. No request was made to Firebase.

**In the running app** (`npm start`, in-app browser, with the new CSP active, no console errors):
- Navigation for Admin, Case Manager (no Billing) and Accounts (no Leads) matches their grants. Blocked links show a message.
- Installment above the fee is rejected with the remaining amount; a valid one saves.
- Sample BDT transactions show 4,000 paid / 6,000 balance per client. The accounting table shows no stray brace.
- Simulated storage-full: the task toggle and the new inquiry are both rolled back, with the message shown.
- Owner label stays correct while searching. Lead conversion relinks its task. Admin→Accounts switch on an accounting report no longer blanks the page.
- Approve payment → over-limit refund rejected → valid refund recorded and approved → balance correct. Reset demo clears everything.

## 5. Remaining issues (not fixed, by design or needing a decision)

1. **Browser-only security.** All demo data and permission checks live in `localStorage` and can be bypassed with developer tools. Real security requires connecting the UI to the backend.
2. **Backend not integrated with the UI, and no invoice or fee-change-request endpoints.** Building them is new feature work, not a bug fix.
3. **Not tested against real Firebase.** The fake does not reproduce real token verification, contention, or quotas. Run Emulator tests before any use.
4. **Role model mismatch.** The UI has Admin / Case Manager / Accounts / Staff; the backend has Admin / Staff with permission lists. Decide on one model when integrating.
5. **Matter currency.** The UI lets any user create a case in any currency; the backend requires the matching currency permission. Left unchanged because it would block the seeded Case Manager from BDT cases, which is a business decision.
6. Matters with no agreed fee recorded are not capped when scheduling installments. Approving a fee *reduction* does not check that already-scheduled installments still fit.
7. Several pending payments can each be within the balance while together exceeding it. Approval re-checks each one, so balances stay correct.
8. The dashboard calendar always shows two hard-coded entries labelled "Demo example" on today's date. The greeting always says "Administrator".
9. The accounting report's currency and date filters reset when the page re-renders (e.g. typing in the global search).
10. No API rate limiting (use a reverse proxy).

## 6. Files changed

| File | Change |
| --- | --- |
| `server.js` | Root path fix, security headers, method/URL validation, `createServer()` export, `HOST` env |
| `dist/model.js` | `normalizeState`, `mayAccessSection`, `remainingToSchedule`, `addSampleBdtTransactions` |
| `dist/app.js` | Section permissions, storage rollback, fee cap, sample-data fix, owner label, reset, actor switch, lead→client task relink, restore-lead fields, client check, PDF opening |
| `dist/accounting.js` | Stray brace, guarded storage writes, journal validation |
| `dist/index.html` | Cache-busting version |
| `dist/firm-crm-demo-source.zip` | Rebuilt from current source |
| `backend/app.js` (new) | API moved here from `server.js` with the fixes above and the two list endpoints |
| `backend/server.js` | Now only the Firebase bootstrap with env validation |
| `backend/test/api.test.js`, `backend/test/fake-firestore.js` (new) | Route tests and in-memory fake |
| `tests/model.test.js`, `tests/server.test.js` (new) | New frontend and server tests |
| `package.json` | `test:backend` script |
| `README.md`, `backend/README.md` | Integration status table, test instructions, accurate limits |
| `.claude/launch.json` (new) | Local preview configuration |
