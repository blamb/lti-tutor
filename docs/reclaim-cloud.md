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

   The database node (`node17689`, 10.100.2.10) accepts password logins from the application node (`pg_hba`: `host all all 0.0.0.0/0 md5`) and listens on 5432.

3. After adding the two secrets, **Apply** in the Variables dialog, then **Restart** the Application Servers layer. (Done 2026-10-13; `/healthz` answered `{"status":"ok","env":"production"}`.) Note that with `NODE_ENV=production` npm skips devDependencies, which is why `typescript`, `tsx` and the `@types/*` packages live in `dependencies`. `npm start` builds, applies the migrations and starts; `https://lti-tutor.ca.reclaim.cloud/healthz` should answer `{"status":"ok"}` within a minute. The node's **Log** (`nodejs.log`) shows the install, build and start output.
4. Register the tool in Moodle: *Site administration → Plugins → External tool → Manage tools → Dynamic registration* with `https://lti-tutor.ca.reclaim.cloud/register`.

## Moodle on the same Reclaim account: private-network routing

Reclaim's containers cannot reach the shared load balancer's public addresses ("no route to host"), and inside the account every `*.ca.reclaim.cloud` name resolves to the node's private address, where only plain HTTP is served (TLS ends at the load balancer). Two consequences for an LMS hosted on the same account, and their fixes:

1. **Tool → Moodle** (OpenID configuration, dynamic registration, keyset, token and grade endpoints): set the variable `PLATFORM_HTTP_HOSTS=moodbox.ca.reclaim.cloud` on the application layer. `src/server/outbound.ts` then sends server-side requests to that host over internal HTTP, keeping the hostname, path and Host header. Done for `lti-tutor`.
2. **Moodle → tool** (Moodle fetches the tool's public keyset to validate deep-linking responses and token requests): after dynamic registration, edit the tool in Moodle (*Manage tools → the tool → Edit*) and change **Public keyset** from `https://lti-tutor.ca.reclaim.cloud/keys` to `http://lti-tutor.ca.reclaim.cloud/keys`. Moodle then reaches the tool node over internal HTTP; the launcher redirects port 80 to the app. Everything the learner's browser touches stays HTTPS.

A Moodle on another host (e.g. TRU's production Moodle) needs neither change.

## Logs and updates

- Node.js logs: the Application Servers layer's **Log** icon → `nodejs.log`.
- Redeploy after a push: Deployment Manager → Git / SVN → the `lti-tutor` repo → deploy icon → environment `lti-tutor`, or tick *Check and auto-deploy updates* in that dialog. `npm start` re-runs migrations, which are idempotent.
- The build runs on every start; it takes a few seconds on 4 cloudlets.
