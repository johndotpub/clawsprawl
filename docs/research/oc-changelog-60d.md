# OpenClaw Changelog Research — 2026-07-15 → 2026-09-14 (last ~60 days)

**Prepared:** 2026-09-14 · **Local install:** OpenClaw 2026.9.4 (3a9d69d) — matches current release
**Scope:** All releases published 2026-07-14 → 2026-09-14, plus the split `CHANGELOG/*.md` files on `main`.

## Method / Sources

1. `gh api repos/openclaw/openclaw/releases --paginate` — enumerated 20 releases in window.
2. `gh api repos/openclaw/openclaw/releases/tags/<tag> --jq .body` — full body for each.
3. `gh api repos/openclaw/openclaw/contents/CHANGELOG.md` — index is split; fetched `CHANGELOG/<version>.md` for each in-window version.
4. `web_search` supplement — **provider unavailable** (Perplexity HTTP 429 rate-limit, then repeated timeout). Substituted with the official docs mirror `https://docs.openclaw.ai/releases` via `web_fetch`, which confirms the release list and one important correction (below). No unreachable claims are made.

Raw data cached locally during research:
- Release bodies: `/tmp/oc-rel/<tag>.md` (20 files, 15,009 lines)
- Split changelogs: `/tmp/oc-cl/<version>.md` (16 files, 32,900 lines)

### ⚠️ Important release-history correction
> "There is no v2026.7.2 release. The `v2026.7.2` betas shipped as v2026.8.1, so pages that mention a 2026.7.2 beta are describing work that reached people in v2026.8.1."
> — https://docs.openclaw.ai/releases

The tags `v2026.7.2-beta.1` … `v2026.7.2-beta.7` exist on GitHub but **have no corresponding CHANGELOG file and were never a shipped line**. Treat all "2026.7.2-beta.N" content as previews of **v2026.8.1**.

### Release index in window (tag · published · name)

| Tag | Published (UTC) | Name |
|---|---|---|
| v2026.9.4 | 2026-09-11 | openclaw 2026.9.4 |
| v2026.6.35 | 2026-09-10 | openclaw 2026.6.35 (final June LTS) |
| v2026.9.3 | 2026-09-08 | openclaw 2026.9.3 |
| v2026.9.2 | 2026-09-05 | openclaw 2026.9.2 |
| v2026.9.1 | 2026-09-03 | openclaw 2026.9.1 |
| v2026.8.2 | 2026-09-01 | openclaw 2026.8.2 |
| v2026.8.1 | 2026-08-31 | OpenClaw 2026.8.1 (AKA OpenClaw 2.0) |
| v2026.9.1-beta.1 | 2026-08-28 | mistakenly published as 2026.9.1-beta.1 (is 8.1-beta.4) |
| v2026.8.1-beta.3 | 2026-08-24 | OpenClaw 2026.8.1-beta.3 |
| v2026.8.1-beta.2 | 2026-08-15 | OpenClaw 2026.8.1-beta.2 |
| v2026.6.34 | 2026-08-08 | openclaw 2026.6.34 |
| v2026.6.33 | 2026-08-08 | openclaw 2026.6.33 |
| v2026.7.1-1 / v2026.7.1-2 | 2026-08-04 | openclaw 2026.7.1-1 / -2 |
| v2026.7.2-beta.7 | 2026-08-02 | (preview → shipped as 8.1) |
| v2026.7.2-beta.6 | 2026-08-01 | (preview → shipped as 8.1) |
| v2026.7.2-beta.5 | 2026-07-28 | (preview → shipped as 8.1) |
| v2026.7.2-beta.3 | 2026-07-18 | (preview → shipped as 8.1) |
| v2026.7.2-beta.2 | 2026-07-17 | (preview → shipped as 8.1) |
| v2026.7.2-beta.1 | 2026-07-15 | (preview → shipped as 8.1) |

Canonical changelog index: `https://github.com/openclaw/openclaw/blob/main/CHANGELOG.md`

---

# 1. BREAKING CHANGES / MIGRATIONS (most important — exhaustive)

## 1.1 Explicitly labelled "Breaking"

| # | Version · Date | Change | Migration |
|---|---|---|---|
| B1 | **v2026.8.1** · 2026-08-31 | **OpenProse removal (breaking).** Bundled OpenProse plugin and `/prose` command removed. | Run `openclaw doctor --fix` to clean stale config; keep existing `.prose` source files. Upstream Agent Skill migration: https://docs.openclaw.ai/prose (#128494) |
| B2 | **v2026.8.1** · 2026-08-31 | **OpenAI route migration (breaking).** `codex/*` and `openai-codex/*` model refs, provider config, stored sessions, and automation routes are obsolete. | `openclaw doctor --fix` migrates them to `openai/*`, preserves Codex runtime intent, flags conflicts for operator repair. |
| B3 | **v2026.9.3** · 2026-09-08 | **Node runtime requirement (breaking).** Requires **Node 24.16.0+** on 24.x, or **Node 26.1.0+**. Node 22, Node 25, and earlier 24.x/26.x **no longer supported**. Node 26 recommended. Node 22/25/old builds risk **SQLite text truncation**. | Upgrade Node **before** OpenClaw. Node CLI/Gateway installs on macOS 11–13.4 or official Linux ARMv7 need a supported host. https://docs.openclaw.ai/install/node (#140672) |
| B4 | **v2026.9.3** · 2026-09-08 | **Execution-policy SDK (breaking).** Retired exec-mode + comparator helpers moved out of `infra-runtime`. | Move to `execPolicy` on `openclaw/plugin-sdk/agent-harness-runtime`; use `resolveExecModePolicy`; select returned fields. https://docs.openclaw.ai/plugins/sdk-runtime/config-and-utilities |
| B5 | **v2026.9.3** · 2026-09-08 | **Approval SDK (breaking).** Approval account-resolution helpers + session filtering contract changed; generic forwarding evaluator retired. | Import account-resolution helpers from `approval-native-runtime`; adapt to full `matchesApprovalRequestFilters` contract; use native channel route gates + shared predicates (no drop-in alias). https://docs.openclaw.ai/plugins/sdk-migration |
| B6 | **v2026.9.3** · 2026-09-08 | **SDK aliases (breaking).** `channel-inbound.buildChannelTurnMediaPayload` renamed; `AbortAndDrainAgentHarnessRunResult` named type **removed**. | Use `buildChannelInboundMediaPayload`. For the retained `abortAndDrainAgentHarnessRun` callable, *infer* its result type (callable + result data still available). |
| B7 | **v2026.9.3** · 2026-09-08 | **Search result callbacks (breaking).** Bounded Find/Grep text moved. | Read `details.content` instead of `details.truncation.content`. Outer tool-message `content` unchanged. (#140008) |
| B8 | **v2026.9.3** · 2026-09-08 | **Directory result callbacks (breaking).** `truncation` and `entryLimitReached` retired. | Use `LsToolDetails.content` + optional `nextAfter`; pass `nextAfter` as `after` to continue listing. https://docs.openclaw.ai/tools/code-mode#guest-runtime-api |
| B9 | **v2026.9.3** · 2026-09-08 | **Agent-owned Workshop skills (breaking).** Workspace ownership replaced by **one writable Workshop collection per agent**; `skills.workshop.allowSymlinkTargetWrites` retired. | Startup and `openclaw doctor --fix` migrate proven legacy skills; ambiguous ownership left in place for review. (#135528) |

## 1.2 Behavioural / default-changing breaks (not labelled "breaking" but break assumptions)

| # | Version · Date | Change | Impact |
|---|---|---|---|
| B10 | **v2026.6.34** · 2026-08-08 | **Upcoming removal gate.** `before_agent_start`, root `openclaw/plugin-sdk` imports, `providerAuthEnvVars`, `channelEnvVars` scheduled for **removal after July 24**. | Migrate to modern hook stages, focused SDK subpath imports, manifest setup descriptors. `/plugins/sdk-migration`, `/plugins/manifest` |
| B11 | **v2026.9.4** · 2026-09-11 | **Removed env aliases.** `OPENCLAW_CLAUDE_CLI_LOG_OUTPUT` removed → `OPENCLAW_CLI_BACKEND_LOG_OUTPUT`. Custom SQLite preloads replaced by `OPENCLAW_SQLITE_LIBRARY`. | Rename env vars in deployment/scripts. (#141854) |
| B12 | **v2026.9.4** · 2026-09-11 | **Bundled `video-frames` skill + helper script removed.** | Use `ffmpeg` directly or install a separate frame-extraction skill. Existing workflows are **not** auto-converted. (#142232) |
| B13 | **v2026.9.4** · 2026-09-11 | **xAI retired "Auto" model choice.** New xAI setups default to **Grok 4.6** (also xAI web search, X search, code-exec). | Explicit choices preserved; default can change cost/availability. Older subscription setups on retired Auto: `openclaw doctor --fix` or pick a model. |
| B14 | **v2026.9.4** · 2026-09-11 | **`openclaw security audit --fix` WhatsApp behaviour.** No longer adds people to the WhatsApp group access list. | Existing previously-added entries are **not removed automatically** — review your list. |
| B15 | **v2026.8.2** · 2026-09-01 | **Plugin SDK type change.** Telegram `botToken` re-typed as `SecretInput` (`string | SecretRef`). | Plugin authors: use the resolved account `token`; read finalization-context `messages` only when `source === "openclaw-transcript"`. (#133988, #134238) |
| B16 | **v2026.8.2** · 2026-09-01 | **Plugin SDK compatibility note.** Published conversation-binding inspection API + command definitions preserved from 2026.8.1; legacy `docks` categories remain visible under Tools but retired docking features are **not** restored. | Check any `docks`-dependent UI/plugin. |
| B17 | **v2026.9.2** · 2026-09-05 | **Cross-agent session access default changed.** Session tools now default to **all-session visibility**; ordinary agent-to-agent access enabled. | Set `tools.sessions.visibility` to `agent` or `self` for narrower access. Existing tool/sandbox restrictions still apply. (#136755) |
| B18 | **v2026.8.2** · 2026-09-01 | **Session visibility default (precursor).** Unsandboxed sessions work with other sessions of the same agent by default, incl. retained cron sessions. | Shared-agent operators should set `tools.sessions.visibility` to `tree` or `self`. (#133469) |
| B19 | **v2026.8.1** · 2026-08-31 | **Session reset default changed.** Conversations are kept across idle periods and day boundaries when no reset policy is configured. | Explicit daily/idle policies and manual `/new` // `/reset` retained. (#111140) |
| B20 | **v2026.8.1** · 2026-08-31 | **CPU-scaled foreground concurrency default.** Default top-level agent concurrency sized from CPU parallelism, **bounded 8–16 simultaneous runs**. | Explicit operator limits preserved. (#114047) |
| B21 | **v2026.8.1** · 2026-08-31 | **Explicit model allowlists.** Aliases/per-model settings separated from explicit `modelPolicy.allow` restrictions; per-agent policies + provider wildcards. | Doctor migrates valid legacy restrictions; **does not silently open access** when migration is incomplete. (#110888) |
| B22 | **v2026.8.1** · 2026-08-31 | **Owner-directed ambient heartbeat default.** Ambient heartbeat alerts go to a resolvable **owner DM** by default; unroutable ambient polls skipped. | Configure an owner or explicit target instead of relying on a previous group conversation. (#121988) |
| B23 | **v2026.8.1** · 2026-08-31 | **Task-suggestion tool renamed.** Suggestion-card tool renamed to `suggest_task`. | Doctor migrates persisted references to the old name. (#121694) |
| B24 | **v2026.8.1** · 2026-08-31 | **OpenAI long-context opt-in.** Expanded active-input context is now an explicit model configuration choice. | Runtime budget kept distinct from model's native capacity; configured overrides preserved. (#112916) |
| B25 | **v2026.8.1** · 2026-08-31 | **Default-on behaviours changed** (privacy/behaviour relevant): personal conversation recall with Active Memory (#110597); grounded dreaming / model-backed background memory consolidation (#114819); automatic self-learning that auto-applies scanner-approved/Workshop-owned skills (#115576). | Explicit disable controls retained; user-authored skill changes stay pending; groups/channels excluded from recall. |
| B26 | **v2026.9.2** · 2026-09-05 | **Swarm enabled by default.** Concurrent sub-agent orchestration on by default. | Explicit opt-outs, tool restrictions and the separate Code Mode opt-in preserved. (#136514, #138056) |
| B27 | **v2026.9.3** · 2026-09-08 | **Recursive delegation enabled by default** (bounded recursive session spawning). | Explicit depth/concurrency limits and sandbox restrictions retained. (#138059) |
| B28 | **v2026.9.3** · 2026-09-08 | **CLI agents shown by default** in the new-session model picker (no opt-in); native CLI session creation enabled. | Set `gateway.cliAgents.enabled: false` to disable. (#139459) |
| B29 | **v2026.9.2** · 2026-09-05 | **Plugin branding path change.** Package plugin icon at `assets/icon.png` instead of a top-level manifest URL. | OpenClaw loads the packaged image without a network request; missing/invalid icons do not block loading. (#131510) |
| B30 | **v2026.9.3** · 2026-09-08 | **MCP prompt adapters.** `SessionMcpRuntime.getPrompt` now returns the typed MCP `GetPromptResult` shape. | External responses are validated instead of returning arbitrary unknown values. (#141421) |
| B31 | **v2026.9.3** · 2026-09-08 | **Gateway secret setup changed.** One Gateway secret field in Control UI + remote onboarding; a **local Gateway token is generated by default** without asking token-vs-password. | Clients that assumed a password prompt must adapt. (#141511, #141514) |
| B32 | **v2026.9.1** · 2026-09-03 | **`config set` strictness + channel disable semantics.** `channels.<id>.enabled: false` no longer loads that channel plugin; new `--expect-current-json`, `--expect-current-absent`, `--dry-run`, `--strict-json`. | Scripts relying on old lax behaviour may need updates. (#135071, #135097, #136137, #136211) |
| B33 | **v2026.9.1** · 2026-09-03 | **Uninstall default changed.** `openclaw uninstall` now defaults to removing **only the service** and keeps user data. | (#134299) |
| B34 | **v2026.9.3** · 2026-09-08 | **Prometheus read authorization.** Prometheus metrics now require **effective operator read permission**. | Unauthenticated scraping breaks. (#140903) |
| B35 | **v2026.9.4** · 2026-09-11 | **Update/repair semantics.** Verified rollback/repair is reported distinctly and "does not turn the original failed update into success"; service-unavailable responses on pre-WebSocket handshake failure. | Client/automation logic that keyed on old update signals must adapt. (#142195, #141451, #141303) |

---

# 2. GATEWAY PROTOCOL CHANGES (affects WS clients)

Ordered by relevance to an external WS + HTTP dashboard client.

| # | Version · Date | Protocol-relevant change | Citation |
|---|---|---|---|
| P1 | **v2026.8.1** · 2026-08-31 | **Reconnect event ordering fixed.** Shared TypeScript client now **resets the outer event-sequence baseline for each replacement WebSocket**, preventing gap recovery from comparing unrelated connection generations. Affects Control UI, TUI, SDK, browser extension. | #116043 · `v2026.8.1.md:259` |
| P2 | **v2026.8.1** · 2026-08-31 | **Device clock skew / handshake signing.** Device proofs must be **signed with the Gateway-issued challenge timestamp** across TS, Control UI, browser extension, Android, Apple, Linux, watchOS. Retains nonce binding + freshness checks; **no-challenge compatibility** kept for pre-challenge Control UI servers and older watch-node HTTP endpoints. | #116679 (fixes #103455) · `v2026.8.1.md:258` |
| P3 | **v2026.9.4** · 2026-09-11 | **Service-unavailable on pre-WS handshake failure.** Return service-unavailable responses when a Gateway handshake fails **before WebSocket transfer**. | #141303 · `2026.9.4.md:1132` |
| P4 | **v2026.8.2** · 2026-09-01 | **Gateway protocol readiness gating.** Setup/repair requires actual Gateway **protocol readiness** before declaring setup complete; Gateway can be stopped even when its state schema is newer. | #133434, #133989, #134084, #133595 · `v2026.8.2.md:91` |
| P5 | **v2026.8.1-beta.2** · 2026-08-15 | **New operator-scoped RPC `tts.speak`** — returns configured-provider speech as **inline whole-clip audio** for remote clients. | #100708 · `v2026.8.1-beta.2.md:71` |
| P6 | **v2026.8.1** · 2026-08-31 | **Gateway chat event types relocated.** Chat event types must be imported from their **owning protocol schema**; the aggregate type module was **removed** (restores full project typechecks). | `v2026.8.1-beta.2.md:222`, `v2026.8.1.md` |
| P7 | **v2026.8.1** · 2026-08-31 | **Control UI initial-prompt handoff rebinding.** Process-local handoff is bound to the **logical browser client** instead of the per-handshake hello snapshot (survives transport reconnects). | #114042 · `v2026.8.1.md:508` |
| P8 | **v2026.8.1** · 2026-08-31 | **Structured pairing/auth failures preserved** for pending RPC callers; generic disconnect behaviour unchanged. | `v2026.8.1-beta.2.md:316` |
| P9 | **v2026.8.1** · 2026-08-31 | **Gateway event dispatch hardening.** Lazy subscriber setup and handler failures are caught and logged instead of leaking unhandled promise rejections. | `v2026.8.1-beta.2.md:327` |
| P10 | **v2026.9.2** · 2026-09-05 | **Chat startup payload compression.** Large **WebSocket payloads are compressed** to load deep-linked conversations sooner; background transcript warming deferred. | #136862 · `v2026.9.2.md:76` |
| P11 | **v2026.9.2** · 2026-09-05 | **RPC latency phase diagnostics.** RPC latency broken into **phases** in OpenTelemetry and Prometheus so slow dispatch vs execution is distinguishable. | #138015 · `v2026.9.2.md:35` |
| P12 | **v2026.9.2** · 2026-09-05 | **Provider account priority exposed through the Gateway.** | #132450 · `v2026.9.2.md` |
| P13 | **v2026.9.3** · 2026-09-08 | **Live activity / reconnect semantics.** Running and queued permitted sessions shown in **Live activity** on entry and reconnect, with a visible limit notice and connection status, **instead of claiming disconnected sessions are idle**. | #141045 · `2026.9.3.md:31` |
| P14 | **v2026.9.3** · 2026-09-08 | **Prometheus runtime identity.** Metrics identify the running process and loaded build. | #139280 · `2026.9.3.md` |
| P15 | **v2026.9.3** · 2026-09-08 | **Bun WS transport compatibility.** Declared WebSocket implementations used under Bun across Discord, Mattermost, Signal, Gateway, workers, voice calls, provider routes — preserving handshake options, payloads, backpressure, transcription limits. | #139480, #139567, #139717, #139919, #140048, #140071, #140318, #141465 |
| P16 | **v2026.9.1** · 2026-09-03 | **Method discovery no longer loads session storage**; encoded/symlinked Control UI assets load; stale 304s avoided; retained asset memory bounded. | #135102, #136444, #135619, #136108 |
| P17 | **v2026.9.4** · 2026-09-11 | **RPC documentation restructure.** Gateway RPC method groups exposed as headings; Gateway RPC guidance split into focused topic pages. | #143459, #143472, #143515 · `2026.9.4.md:3596-3598` |
| P18 | **v2026.7.2-beta.1** (→8.1) | Apple apps connect iPhone and Watch clients to **protocol-v3 Gateways**. | #106294, #106513, #107188 |
| P19 | **v2026.9.1** · 2026-09-03 | **Nonce enforcement on Azure BYOK proxy**; scoped node tokens manageable by owner; oversized A2A JSON-RPC batches/responses rejected; pre-auth read bounding on SMS webhooks; per-client webhook rate limits. | #136504, #135904, #134781, #134622, #135617, #134603 |
| P20 | **v2026.9.4** · 2026-09-11 | **Node/device command timing.** Commands on connected devices no longer time out early or wait longer because the system clock changed; **wake time counts toward the same limit as running the command**. Empty numeric options now error. | `2026.9.4.md:~3508` |

---

# 3. NEW FEATURES RELEVANT TO AN EXTERNAL DASHBOARD CLIENT

## 3.1 Dashboards & widgets

- **Interactive widgets in chat + pinning to session dashboards** — `show_widget`; grant exact actions or network origins to pinned widgets; export rendered views as PNGs. (v2026.8.1 #101840, #108889, #108983, #110960, #110987, #110992, #111030, #125803, #127315)
- **Native dashboard reports without an iframe** — display bounded report data directly through `show_widget` and dashboard authoring. (v2026.9.3 #139306)
- **Dashboard gallery + layout freedom** — browse saved dashboards, swap chat/dashboard views, place panels **left, right, or below**, keep loaded widget input when hiding/reopening a panel. (v2026.9.2 #137069, #137068, #138077)
- **Dashboard maximize/restore** — full task area toggle; draft and entered dashboard content stay in place. (v2026.9.4 #143579)
- **Dashboard progress follows its conversation** — selecting a different agent elsewhere no longer makes running work look paused. (v2026.9.4, `2026.9.4.md:489`)
- **Dashboard widget activity for its target session.** (v2026.9.4 #137255)
- **MCP dashboards** — pin interactive MCP app views from a conversation to its dashboard, retaining bounded tool grants and restoring the view when reopened. (v2026.8.1 #111524)
- **Workboard on session dashboards** — link boards to owning automations, run attached automations when linked sessions finish, show complete boards. (v2026.8.1 #125076, #125170, #125094)
- **Goals** — create and manage goals from the Control UI without slash commands. (v2026.8.1 #131370)
- **Widget script-error surfacing** — web app shows a Script error notice and tells the agent; syntax errors caught before display. (v2026.9.4 #142225, #141939, #142147)

## 3.2 Progress cards & events

- **Durable progress cards** — one durable progress card per session across **web, macOS, iOS, Android, and dashboard views**, retaining the latest plan/status through reloads. (v2026.8.1 #125125, #125438, #125442, #125444)
- **Follow subagent activity and accumulating edits** across web + native chat. (v2026.8.1 #121549, #121840, #121815, #121813)
- **Progress cards scoped better** — agents instructed to skip progress cards for quick questions, reserve them for substantial work; finished/cancelled helper tasks stop showing stale working messages. (v2026.9.4, `2026.9.4.md:464`)
- **Persistent sessions & subagent runs** — persistent sessions are editable/steerable in their parent tree; subagent runs are **view-only**, omit author avatars, keep live progress in the parent conversation, inactive cards **paused**. (v2026.9.3 #139367, #139371, #139381, #139456, #141499)
- **Conversation reset progress** — previous task progress card cleared on full reset, older in-flight write cannot restore it. (v2026.9.3 #140412)

## 3.3 Sessions

- **Conversation search** — search past conversations by exact words/phrases; reopen surrounding messages from a matching hit. (v2026.8.1 #105057, #105585, #105635, #105831)
- **Session search beyond loaded window** — find older matching sessions and load their matching rows. (v2026.9.2 #138167)
- **Conversation branches** — rewind/fork from a persisted user message, switch among retained transcript branches. (v2026.8.1 #110660, #110857, #110886, #112056, #112284)
- **Public session transcripts (v2026.9.3)** — owners/admins can **explicitly publish** existing + future conversation text to anyone with a public URL and revoke later; read-only view omits tools, reasoning, files, images, executable widgets. (v2026.9.3 #139489)
- **Private-session link previews** — generic OpenClaw card, no private content read. (v2026.9.3 #139250)
- **Session organization** — session colors across web + native; **web sidebar grouped by project**; search sessions and connected catalogs from the command palette. (v2026.8.1 #132570, #131543, #128356)
- **Beam links** — readable `/beam/` URLs named after sessions. (v2026.8.2 #125755, #133463)
- **Session visibility / membership** — set visibility and membership, assign owner, enforce who may view/suggest/contribute, retain creator attribution. (v2026.8.1 #112787, #125057)
- **Shared Gateway profiles** — display names/avatars, who is online, session-creator attribution with person filters. (v2026.8.1 #111224, #111421, #111501, #112658)
- **Session history retention** — aged durable conversations archived with IDs + transcript generations intact; **default active-session cap raised to 5,000** (explicit configured limits preserved). (v2026.9.3 #136639)
- **Chat navigation** — previewable position rail for long conversations, hover previews, direct jumps. (v2026.9.3 #138603)

## 3.4 Channels / nodes / devices

- **Devices at a glance** — device types, **resource meters, capability chips, Desktop availability** in the Devices page; native iOS CPU/memory and Android memory/disk reporting. (v2026.9.2 #136858, #137082, #137083)
- **Device aliases** — rename paired devices directly from the Control UI Devices page. (v2026.9.3 #138852)
- **Nodes:** ambiguity between current node clients preserved; recently connected nodes stay in list age filters; remote exec hides without an executable node; node wakes retry after clock rollback; presence expires after rollback and stays bounded. (v2026.9.1)
- **Sessions beyond your Gateway** — run work on paired devices or cloud workers, move the session workspace with it, reuse warm machines/project seeds. (v2026.8.1 #123280, #127752, #131744, #132374)
- **Cloud worker snapshots** — inspect/recover cloud snapshots in the Control UI; build project snapshots from Settings. (v2026.9.4 #143814, #143929)
- **Provider account controls** — add/remove accounts, manage account priority, clear an agent's custom order without disconnecting. (v2026.9.3 #132451)
- **Active sessions in Live activity** — running and queued permitted sessions shown on entry and reconnect. (v2026.9.3 #141045)
- **Usage statistics controls** — opt-in feature statistics; inspect payloads with `openclaw telemetry show`; feature statistics **default off**. (v2026.8.1 #128476)
- **Owner profiles** — durable Owner profile for single-user Gateway connections (no extra permissions). (v2026.9.2 #136819)
- **Experimental plugin UI** — Settings → Labs → Custom plugin UI lets plugins contribute Control UI **pages, panels, and session actions** or customize composer/workspace. (v2026.9.2 #134943)

## 3.5 Canvas / embeds / media

- **Canvas A2UI validation** — malformed/unsupported JSONL rejected at CLI, agent-tool, and node-invoke boundaries while preserving native **v0.8 dispatch**. (v2026.8.1 #103713)
- **Embedded Dashboard/browser/Canvas web views** — Tab traverses links and controls inside embedded Dashboard, browser, and Canvas web views. (v2026.8.1 #122128)
- **IPv6 Gateway access** — canvas, boards, and other plugin-hosted surfaces reachable when the Gateway uses **bracketed IPv6 hosts**, including forwarded host headers. (v2026.8.2 #134050)
- **Mermaid diagrams in every chat** — Control UI + native macOS/iOS/Android, enlarge previews, retry on mobile. (v2026.9.1 #134913, #135746, #135470, #135342)
- **Richer audio/video** — media attached across uploads, generated replies, playback, reloads; native playback controls; video uploads on Apple + Android. (v2026.8.1 #115842, #116051, #116037)
- **Browser panel live repaint** — watch agent browser tabs repaint live, screenshot fallback when streaming unavailable; macOS native WebKit tabs. (v2026.9.3 #140988, #141031)
- **Cross-session conversations** — forwarded messages rendered as distinct speech bubbles with source-session links and sending-agent identity. (v2026.8.2 #132054, #133439)

---

# 4. DEPRECATIONS WITH DEADLINES

| Deprecation | Recorded removal target | Status at 2026-09-14 | Source |
|---|---|---|---|
| **Plugin SDK legacy hook + import surfaces**: `before_agent_start`, root `openclaw/plugin-sdk` imports, `providerAuthEnvVars`, `channelEnvVars` → modern hook stages, focused subpath imports, manifest setup descriptors | **after 2026-07-24** | **Passed** | v2026.6.34 (`"Upcoming deprecations"`) · `/plugins/sdk-migration`, `/plugins/manifest` |
| **Plugin SDK import paths** (5 IDs): `plugin-sdk-config-runtime-subpath`, `plugin-sdk-channel-reply-pipeline-subpath`, `plugin-sdk-channel-lifecycle-subpath`, `plugin-sdk-channel-message-subpath`, `plugin-sdk-infra-runtime-subpath` | **2026-09-01** | **Passed** — these paths remained *available* in 2026.8.2 with removal target 2026-09-01 | v2026.8.1 (`Changes`), v2026.8.2 (`Upcoming deprecations`, `v2026.8.2.md:132`) |
| **Plugin SDK context aliases** (`sdk-untrusted-context-identifier-aliases`) → `MsgContext.ChannelPromptContext`, `MsgContext.ChannelStructuredContext`, `ChannelStructuredContextEntry`, `SupplementalContextFacts.channelStructuredContext`, `buildChannelMetadata` | **2026-09-08** (window) | **Passed** — v2026.9.3 notes aliases *remained exported in that release* but deprecated with removal window 2026-09-08 | v2026.9.2 (`Upcoming deprecations`), v2026.9.3 (`Deprecation migration`, `2026.9.3.md:216`) · `/plugins/compatibility` |
| **`openclaw/plugin-sdk/infra-runtime` — system-event snapshot inspection/consumption** | (in migration guide) | **No modern public replacement recorded** | v2026.8.2 (`v2026.8.2.md:136`) |
| **Native-hook relay endpoints** | (retired) | **Retired** — stop advertising retired native-hook relay endpoints | v2026.9.4 #141608 |
| **xAI "Auto" model choice** | (retired) | **Retired** — use `openclaw doctor --fix` or pick a model | v2026.9.4 (`2026.9.4.md:2728`) |
| **`mimo-v2-omni` / `mimo-v2-pro` aliases** (OpenCode Go) | (removed) | **Removed** — aliases stopped being exposed | v2026.8.1 #103311, #103329 |
| **`hy3-preview` alias** (OpenCode Go) | (replaced) | **Replaced by `hy3`** | v2026.6.34 |

### Deadlines still open / worth watching
- **v2026.9.4 notes**: "Pending: ClawHub recovery, npm beta-selector synchronization, remaining native app distribution, and stable main closeout. Android native qualification failed." (release-verification section — not a deprecation, but an open item)
- The three SDK gates (2026-07-24, 2026-09-01, 2026-09-08) have **all passed**; verify any external plugin against `/plugins/sdk-migration` and `/plugins/compatibility`.

---

# 5. OTHER NOTABLE (reliability/security, non-breaking)

- **Session/data safety (v2026.7.2-beta.5 → 8.1):** quarantine store surviving primary-DB damage, crash-recoverable SQLite snapshots, schema-upgrade data-loss rejection, rollback-writer snapshot recovery. (#110453, #113367, #113453, #113473, #113580)
- **SQLite snapshots CLI:** `openclaw backup sqlite create|list|verify|restore` (compact, verified, fresh-target-only restore). (v2026.8.1 #105718)
- **Recoverable backups:** scheduled DB backups, versioned snapshots in operator-owned Git repo, restore verified full archive into fresh staging dir. (#122485, #122750)
- **Secrets redaction:** `config.get` no longer returns unredacted pre-migration snapshots; systemd unit backups no longer leak Gateway tokens. (v2026.9.1 #134940, #135798)
- **MCP response limits:** oversized HTTP responses and SSE events rejected before parsing while keeping healthy long-lived streams. (v2026.8.2 #123194)
- **External supervision mode:** `OPENCLAW_SUPERVISOR_MODE=external` lets an external supervisor own Gateway restarts/lifecycle/updates. (v2026.8.1 #109162, #119846, #121069)
- **Headless agent runs:** `openclaw agent exec` with chosen working dir, temp/optional-retained state, explicit model fallbacks, machine-readable results. (v2026.8.1 #113988, #116038)
- **Configuration change history:** records config changes with writer labels, sensitive-value redaction, manual-edit detection. (v2026.8.1 #111147, #111286)
- **Diagnostics:** garbage-collection duration metrics; slow agent-database open phases identified. (v2026.9.3 #138125, #139592)
- **Security posture hardening (v2026.9.1):** bounded pre-auth reads, revoked Watch nodes stop receiving commands, per-process nonce on Copilot Azure BYOK proxy, oversized A2A JSON-RPC rejection, browser/filesystem boundary fixes.
- **Node runtime repair (v2026.9.4):** `openclaw gateway install` can switch a background service to an available supported Node version; private Node.js update offered when the CLI cannot start. (#142742, #143159, #143464)

---

# 6. TOP 5 MOST IMPACTFUL FOR AN EXTERNAL DASHBOARD CLIENT (WS + HTTP)

1. **Node runtime floor (v2026.9.3)** — the dashboard-hosted Gateway/client host must run **Node 24.16.0+ or 26.1.0+**. Node 22/25 and older 24.x/26.x are unsupported and risk **SQLite text truncation** (data corruption class). This is the single hardest upgrade gate. (#140672)
2. **Device-proof signing tied to the Gateway challenge timestamp (v2026.8.1)** — WS auth now signs device proofs with the **Gateway-issued challenge timestamp**; this fixes clock-skew auth failures but changes the handshake contract, with no-challenge compatibility only for *pre-challenge* Control UI servers and older watch-node HTTP endpoints. (#116679 / #103455)
3. **Reconnect event-sequence baseline reset (v2026.8.1)** — the client's outer event-sequence baseline resets per replacement WebSocket. Any dashboard implementing **sequence-gap recovery** must reset its baseline on every reconnect or it will compare unrelated connection generations and mis-recover. (#116043)
4. **Session visibility defaults widened (v2026.8.2 → v2026.9.2)** — session tools now default to **all-session visibility** with agent-to-agent access enabled. A dashboard that lists or proxies sessions will see a materially wider scope unless `tools.sessions.visibility` is set to `agent`/`self`/`tree`. (#133469, #136755)
5. **Gateway auth onboarding + new session/Live-activity semantics (v2026.9.3)** — single Gateway secret field with a **default-generated local token** replaces token-vs-password choice, and **Live activity** now distinguishes running/queued sessions from disconnected ones on entry and reconnect (no more "idle" for disconnected). Prometheus metrics also now require **operator read permission**, breaking unauthenticated scraping. (#141511, #141514, #141045, #140903)

**Runner-up:** WS payload compression for chat startup (v2026.9.2 #136862) — any dashboard parsing raw WS frames must handle compressed payloads.

---
*Report generated 2026-09-14. Primary source: GitHub releases + `CHANGELOG/*.md` on `main` (fetched via `gh api`). Web search supplement unavailable (provider 429/timeout); docs mirror `https://docs.openclaw.ai/releases` used instead and cited where it corrected or confirmed findings.*
