# Deploying on Reclaim Cloud

Reclaim Cloud (a Virtuozzo Application Platform, formerly Jelastic) runs the tool as a plain Node.js container next to a PostgreSQL container, pulling the code from GitHub. Nothing in the repository is specific to Reclaim: the same `npm start` works on any host that runs `npm install` then `npm start`.

## Topology

| Node | Stack | Notes |
|---|---|---|
| Application server | Node.js 22, **npm** process-manager tag (`22.x-npm`) | The `-npm` tag starts the app with `npm start`, which builds (tsc), runs migrations and launches the server. 4 reserved / 8 max cloudlets is plenty to start. |
| SQL database | PostgreSQL 17 | Credentials arrive by email when the node is created and are also under the node's **Config** / **Reset password** menu. |
| SSL | Built-in SSL on | Gives `https://<env>.ca.reclaim.cloud` through the shared load balancer with no public IP. |

Environment name `lti-tutor` → `https://lti-tutor.ca.reclaim.cloud`.

## Deployment (done on 2026-10-13 for `lti-tutor`)

1. **Deployment Manager → Git / SVN → Add Repo**: `https://github.com/blamb/lti-tutor.git`, branch `main` (the repository is public; no authentication). Deployed to the Node.js node's `ROOT` context. Reclaim runs `npm install` on deploy and on every restart (`UPDATE_PACKAGES_ON_RESTART=TRUE`), then `npm start` because the node is the `-npm` process-manager variant; the launcher (`/usr/local/sbin/nodejs`) detects whichever port the app listens on and redirects port 80 to it, so `PORT` can be any unprivileged port.
2. **Application Servers → ⚙ → Variables** holds the configuration. Already set:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `LTI_TOOL_URL` | `https://lti-tutor.ca.reclaim.cloud` |
| `PORT` | `8080` |
| `TOOL_NAME` | `LTI Tutor` |
| `DATA_RETENTION_DAYS` | `0` |
| `LTI_COOKIE_SECRET` | set (random, 64 hex chars) |

   Still to add (secrets, entered by the account owner):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgres://webadmin:<password>@node17689-lti-tutor.ca.reclaim.cloud:5432/postgres` — the password is in the "environment created" email, or reset it from the PostgreSQL node's ⚙ menu. The `postgres` database works as-is; to use a dedicated one, create `lti_tutor` in the node's web admin (its *Open in browser* icon) and change the last path segment. |
| `ANTHROPIC_API_KEY` | the key for this deployment's Console workspace |
| `ANTHROPIC_BASE_URL` | optional: a sovereign endpoint |
| `TOKEN_SECRET` | optional: encrypts per-course Moodle web-service tokens; empty derives the key from `LTI_COOKIE_SECRET` (rotating either invalidates stored tokens; instructors reconnect) |

   The database node (`node17689`, 10.100.2.10) accepts password logins from the application node (`pg_hba`: `host all all 0.0.0.0/0 md5`) and listens on 5432.

3. After adding the two secrets, **Apply** in the Variables dialog, then **Restart** the Application Servers layer. (Done 2026-10-13; `/healthz` answered `{"status":"ok","env":"production"}`.) Note that with `NODE_ENV=production` npm skips devDependencies, which is why `typescript`, `tsx` and the `@types/*` packages live in `dependencies`. `npm start` builds, applies the migrations and starts; `https://lti-tutor.ca.reclaim.cloud/healthz` should answer `{"status":"ok"}` within a minute. The node's **Log** (`nodejs.log`) shows the install, build and start output.
4. Register the tool in Moodle: *Site administration → Plugins → External tool → Manage tools → Dynamic registration* with `https://lti-tutor.ca.reclaim.cloud/register`.

moodbox web services: enabled, REST protocol on, external service **LTI Tutor course sync** with all twelve functions in `src/core/moodle-ws.ts`; one token per instructor on that service serves both tools.

## A second environment for Persona Chat (created 2026-10-15, last redeployed 2026-10-21)

Persona Chat deploys from the same repository and branch as its own environment with its own PostgreSQL node, so the two tools never share data or a registration. Environment `persona-chat` (Node.js 22.23.2 npm, node 17694; PostgreSQL 17.10, node 17695) is live at https://persona-chat.ca.reclaim.cloud, registered in moodbox and connected to a course through the shared web-service token. It was last redeployed on 2026-10-21 from `main` at `a34ad60` (the October 21 usability fixes and the fact sheet, migrations 006 and 007). The checklist that was followed, for the next environment:

### 1. Create the environment (Reclaim dashboard)

1. **New Environment** → Node.js, version **22**, the **npm** process-manager tag (`22.x-npm`); add a **PostgreSQL 17** node; **Built-in SSL** on; region **Canada**; name **`persona-chat`**. Cloudlets 4 reserved / 8 max on the Node.js node, as for the tutor. Result: `https://persona-chat.ca.reclaim.cloud`.
2. The PostgreSQL credentials (`webadmin` and a password) arrive by email and sit under the node's **Config** / **Reset password** menu. The default `postgres` database works; for a named one, open the node's web admin (its *Open in browser* icon) and create `persona_chat`.
3. **Deployment Manager → Git / SVN**: the `lti-tutor` repository entry already exists; click its deploy icon, choose environment **`persona-chat`**, context **ROOT**, branch `main`. Reclaim runs `npm install` and then `npm start`, which builds, applies the migrations (core, then the persona app's own) and starts the server.

### 2. Variables (Application Servers layer → ⚙ → Variables)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP` | `persona` |
| `LTI_TOOL_URL` | `https://persona-chat.ca.reclaim.cloud` |
| `PORT` | `8080` |
| `TOOL_NAME` | `Persona Chat` |
| `LTI_COOKIE_SECRET` | a new random value (`openssl rand -hex 32`); not the tutor's |
| `DATABASE_URL` | `postgres://webadmin:<password>@<the PostgreSQL node's host>:5432/postgres` (or `/persona_chat`) |
| `ANTHROPIC_API_KEY` | the key for this deployment's Console workspace (a separate key keeps the two tools' spend apart) |
| `PLATFORM_HTTP_HOSTS` | `moodbox.ca.reclaim.cloud` (Moodle on the same account; see the next section) |
| `PERSONA_MODEL` | optional; `claude-haiku-5-5` is the default for new personas |
| `GEN_MODEL` | optional; drafts, debriefs and syntheses; `claude-haiku-5-5` by default |
| `DATA_RETENTION_DAYS` | `0` |
| `TOKEN_SECRET`, `ADMIN_TOKEN`, `ANTHROPIC_BASE_URL` | optional, as for the tutor |

`TUTOR_MODEL` is not read by Persona Chat. The Variables editor needs **Save** twice; then **Restart** the Application Servers layer.

### 3. Check it

- `https://persona-chat.ca.reclaim.cloud/healthz` answers `{"status":"ok","app":"persona",…}` within a minute.
- The node's **Log** (`nodejs.log`) shows `apply core/001_core.sql` … `apply 007_fact_sheet.sql` on the first start; a redeploy shows `apply` only for migrations it has not seen and `skip` for the rest.

### 4. Register it in Moodle (moodbox)

1. *Site administration → Plugins → Activity modules → External tool → Manage tools → Dynamic registration* with `https://persona-chat.ca.reclaim.cloud/register` → **Add LTI Advantage** → **Activate**.
2. Edit the tool (*Manage tools → Persona Chat → Edit*):
   - **Public keyset**: `http://persona-chat.ca.reclaim.cloud/keys` (plain HTTP, because Moodle on the same account reaches the node over the private network; see the next section).
   - **Supports Deep Linking (Content-Item Message)**: on.
   - **IMS LTI Assignment and Grade Services**: *Use this service for grade sync and column management* (needed for completion passback).
   - **Default launch container**: *New window* (voice needs the full window; inside Moodle's iframe the microphone is blocked and the page offers Full screen instead).
   - **Tool configuration usage**: *Show in activity chooser and as a preconfigured tool*.
3. In a course: *Add an activity → External tool → Persona Chat → Select content* → tick **Persona Chat home** → add. The same picker lists each persona as its own activity once personas exist; a persona with *Post completion to the gradebook* on carries a gradebook column with it.

### 5. First personas

Launch the home activity as a teacher → **Designer view** → **New persona** → choose the template → **Start from existing instructions** and paste the existing Custom GPT instructions and profile (the Melissa Chang and Tagore files are the reference cases) → **Draft the fields** → check each section, the hidden layer above all → tick materials → **Published** → **Save** → **Try it as a student**. Materials: upload the PDFs, import by URL, import the course backup, or connect the course under **Moodle connection** on the Materials tab (the same web-service setup the tutor uses; one service and token can serve both tools since both read with the same functions).

### 6. What to test in Moodle that the local harness could not

Done so far: the teacher launch, the Designer view, and the live sync. A student run of a Russell persona and a simulated patient (the October 21 usability report) showed the fixes now deployed. Those fixes were tested with the replay harness and a local browser, not yet in Moodle. Still to try:

- A student launch of the home activity and of a persona placed on its own.
- Ending a conversation with a persona placed as an activity with the gradebook on: the column appears in the gradebook with 1/1, and the report shows *posted*.
- A persona set to *Anyone with the link*: open the link in a private window.
- After the October 21 redeploy: typing "end simulation" opens the end dialog; the debrief shows Critical issues and turn links; a placed persona's page lists only that persona and shows the activity title.
- Filling a live persona's case file, fact sheet or quote book in the Designer view and checking a conversation uses it.

## Moodle on the same Reclaim account: private-network routing

Reclaim's containers cannot reach the shared load balancer's public addresses ("no route to host"), and inside the account every `*.ca.reclaim.cloud` name resolves to the node's private address, where only plain HTTP is served (TLS ends at the load balancer). Two consequences for an LMS hosted on the same account, and their fixes:

1. **Tool → Moodle** (OpenID configuration, dynamic registration, keyset, token and grade endpoints): set the variable `PLATFORM_HTTP_HOSTS=moodbox.ca.reclaim.cloud` on the application layer. `src/core/outbound.ts` then sends server-side requests to that host over internal HTTP, keeping the hostname, path and Host header. Done for `lti-tutor`.
2. **Moodle → tool** (Moodle fetches the tool's public keyset to validate deep-linking responses and token requests): after dynamic registration, edit the tool in Moodle (*Manage tools → the tool → Edit*) and change **Public keyset** from `https://lti-tutor.ca.reclaim.cloud/keys` to `http://lti-tutor.ca.reclaim.cloud/keys`. Moodle then reaches the tool node over internal HTTP; the launcher redirects port 80 to the app. Everything the learner's browser touches stays HTTPS.

A Moodle on another host (e.g. TRU's production Moodle) needs neither change.

## Logs and updates

- Node.js logs: the Application Servers layer's **Log** icon → `nodejs.log`.
- Redeploy after a push: Deployment Manager → Git / SVN (the panel sometimes opens on Archive) → hover the `lti-tutor` repo row → deploy icon → branch `main` → environment: the Application Servers node of `lti-tutor`, or of `persona-chat` further down the list → **Deploy** → **Yes** to "Context ROOT is already in use. Redeploy context?". Or tick *Check and auto-deploy updates* in that dialog. `npm start` rebuilds and re-runs migrations, which are idempotent; the app starts only after they succeed, so `/healthz` answering with a fresh `uptime_s` (within about two minutes) means they applied.
- The build runs on every start; it takes a few seconds on 4 cloudlets.
