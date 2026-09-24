# BlackNexa AI News Engine

Python · FastAPI · Pydantic · httpx · SQLAlchemy

The AI generation engine for BlackNexa news: grounded web search, briefing
synthesis, photojournalistic imagery, TTS audio and 19-language translation —
and the AI stage of **incident-report moderation**: a policy assessment of member
reports, comments and photo thumbnails before they are published (see
[Content moderation](#content-moderation)).

Extracted from the Node backend's in-process AI layer. **Every public and admin
endpoint still lives in `blacknexa-backend`** — this service is internal, called
server-to-server, and never reachable by a client.

Boundary, contract and the reasoning behind both:
[`docs/AI_ENGINE_MIGRATION_PLAN.md`](docs/AI_ENGINE_MIGRATION_PLAN.md).

---

## Quick start

```bash
cp .env.example .env       # set SERVICE_JWT_SECRET, GEMINI_API_KEY and EXA_API_KEY
uv venv && uv pip install -e ".[dev]"
uv run uvicorn app.main:app --reload --port 8100
```

Then in `blacknexa-backend/.env`:

```
AI_ENGINE_URL=http://localhost:8100
AI_ENGINE_TOKEN=<a token minted with the same SERVICE_JWT_SECRET>
```

Mint a token for local testing:

```bash
uv run python -c "from app.core.security import create_service_token; print(create_service_token())"
```

With `AI_ENGINE_URL` unset, Node keeps using its own in-process AI implementation,
so adopting this service is reversible without a redeploy.

---

## Providers

Two, called directly. There is no aggregating AI gateway in front of them, and no
`AI_TOOLKIT_SECRET_KEY`.

| Capability | Provider | Model / endpoint |
| --- | --- | --- |
| Synthesis, translation | Gemini | `gemini-2.5-flash-lite` |
| Imagery | Gemini | `gemini-2.5-flash-image` |
| Audio briefings | Gemini | `gemini-2.5-flash-preview-tts` |
| Content moderation | Gemini | `AI_MODERATION_MODEL` (defaults to the synthesis model) |
| Grounded search | Exa | `POST api.exa.ai/search` |

`GEMINI_API_KEY` and `EXA_API_KEY` are both required in production, and `/ready`
reports false without either. The failure modes differ and are logged separately:
no Gemini key means nothing generates at all; no Exa key means nothing grounds, so
every synthesis stops at `no_source_material`.

**Why Exa is still its own provider.** Gemini can search via its built-in
grounding tool, but it returns opaque redirect URLs and no page excerpts. The
source cards need a real publisher URL and a dated excerpt, and the citation
filter needs retrieved text to intersect the model's claims against — so
retrieval stays with Exa.

**Audio is `audio/wav`, not `audio/mpeg`.** Gemini's TTS returns raw headerless
PCM; `audio/tts.py` frames it in a 44-byte RIFF/WAVE header in pure Python, which
is what keeps this service free of an audio codec dependency. `expo-av` plays WAV
on every target. The backend's `sniffMediaType` and its S3 extension map both know
`audio/wav`.

**Two settings worth understanding before changing them.**
`GEMINI_THINKING_BUDGET` is `0`: thought tokens are billed against
`maxOutputTokens` and add seconds of latency, and a thought-heavy answer can
return no text at all. `GEMINI_SAFETY_THRESHOLD` is `BLOCK_ONLY_HIGH`, because at
Gemini's stricter defaults, straight reporting on police accountability, civil
rights and geopolitics — four of this platform's eight categories — gets filtered
often enough to break the feed. Editorial control comes from the synthesis prompt
and the injection screen instead.

### Commands

| Command | Purpose |
|---|---|
| `uv run uvicorn app.main:app --reload` | dev server |
| `uv run pytest` | unit tests |
| `uv run pytest -m integration` | integration tests (needs the service running) |
| `uv run ruff check app tests` | lint |
| `uv run mypy app` | type check |
| `uv run python -m app.workers.cleanup --days 30` | prune old run logs |
| `uv run alembic upgrade head` | apply migrations (only if persistence is on) |

---

## What this service does

```
topicPrompt ─► [1] Exa search ─► hits ─► [2] Gemini synthesis ─► JSON
                                                │
                          [3] filter sources: intersect cited URLs with real hits
                                                │
                                     fast path ─┴─ deep path ─► [4] image generation
```

**Stage 3 is the product guarantee.** A cited URL survives only if it appears
verbatim in what the search stage actually returned; anything the model invented is
dropped, and if nothing survives the top hits are substituted so a source card
always carries a real, traceable link. That is what makes the
"100% FACTUALLY VERIFIED" badge defensible.

Ported verbatim from the Node engine: the prompts, both length rules, all model
ids, and every tuning parameter.

| Parameter | Fast | Deep |
|---|---|---|
| Exa results / chars | 8 / 800 | 12 / 2400 |
| Synthesis max tokens | 2800 | 7200 |
| Length rule | 525–975 words | 2100–3200 words |
| Image | deferred to background | inline |

Transport: 20 s timeout, one retry after 300 ms.

---

## Layout

```
app/
  api/v1/internal/   news and moderation routes — service-token auth
  api/v1/admin/      run-log observability — role-gated
  core/              config, logging, security, errors, prompt_safety
  ai/
    graph.py         the pipeline runner
    state.py         typed state threaded between nodes
    nodes/           search → synthesis → source_filter → image
                     moderation_prescreen → moderation_classify → moderation_finalise
    moderation_graph.py, moderation_state.py   the moderation runner and state
    prompts/         verbatim ports of the editorial prompts + daily rotation,
                     and the moderation policy (moderation.py)
  integrations/
    search/exa.py    grounded web search — api.exa.ai
    llm/gemini.py    generateContent client: request shape + part extraction
    llm/chat.py      text generation + defensive JSON extraction
    llm/image.py     multimodal image generation
    audio/tts.py     speech synthesis + PCM→WAV framing
    transport.py     shared pooled HTTP with retry/timeout parity
  services/          orchestration above the graph
  models/            SQLAlchemy run-log model
  repositories/      run-log queries
  workers/cleanup.py retention sweep
```

The pipeline is deliberately a small explicit runner rather than a workflow
framework. The shape that matters — discrete nodes, a typed state object, an edge
list — is already in place, so adopting LangGraph later is a change to `graph.py`
alone.

---

## Contract

Base path `/api/v1/internal`, all requiring a bearer service token.

| Method | Path | Replaces in Node |
|---|---|---|
| POST | `/news/search` | `aiGatewayService.searchWeb()` |
| POST | `/news/synthesize` | `generateGroundedArticleFast()` / `generateGroundedArticle()` |
| POST | `/news/image` | `generateArticleImage()` |
| POST | `/news/audio` | `generateArticleAudio()` |
| POST | `/news/translate` | `i18nService.translateArticle()` |
| GET | `/news/daily-prompts` | `pickDailyBatch()` / `dayIndexAt()` |
| GET | `/news/languages` | `SUPPORTED_LANGUAGES` |
| POST | `/moderation/assess` | new — the AI stage of the moderation worker |

Plus `/api/v1/admin/runs`, `/runs/summary`, `/runs/prune`, and unauthenticated
`/health` and `/ready`. `/ready` also reports `moderationReady` (Gemini configured
and permitted for moderation) without changing `ready`.

### `/news/synthesize` returns a synthesis result, not an article

No `id`, `slug`, `contentHash`, `publishedAt` or `imageUrl`. Node assembles those,
which keeps article identity and the 242-URL curated fallback pools in exactly one
place. Duplicating the FNV-1a hash and the slugifier here would create a drift risk
that silently breaks feed dedup, and the fallback pool is read synchronously on
every feed request — an HTTP hop per article would turn one query into 50 calls.

### Failure semantics

Every AI method in Node returns `null` on failure and the feed degrades around it.
That contract is preserved: a timeout, a 5xx, or an unreachable engine yields
`null` in the Node client, so `POST /news/generate` still answers 502, the daily
batch still reports `failed: N`, and translations still fall back to English.
**The news feed never fails because this service is down.**

---

## Security

| Requirement | Implementation |
|---|---|
| JWT + RBAC | HS256 service tokens with verified `iss`/`aud`; `admin`/`auditor` roles on `/admin/*` |
| CORS | empty allowlist by default — no browser origin is legitimate here |
| Rate limiting | keyed by token subject, not IP, with a tighter limit on generation routes |
| Validation | Pydantic on every request and response; `extra="forbid"` blocks mass assignment |
| SQL | SQLAlchemy with bound parameters only |
| Secrets | pydantic-settings with fail-fast validation |
| Error handling | one handler; provider bodies and tracebacks logged, never returned |
| External URLs | scheme and private/loopback/link-local ranges rejected before a URL can be cited |
| Prompt injection | see below |

### Prompt injection

Two untrusted inputs reach the news model, and **neither was screened in the Node
engine** (member report text, the third, is covered under
[Content moderation](#content-moderation)):

1. `topicPrompt`, from `POST /api/v1/news/generate` — public and unauthenticated.
2. Exa result `title` and `highlights` — lifted from live web pages, so anyone who
   can get a page indexed for a topic BlackNexa covers can put text in it. This is
   the more dangerous one: it needs no API access at all.

The realistic damage is not leaking a system prompt. It is steering a *published,
fact-checked-looking* article — injecting fabricated claims, attributing them to a
real outlet, or getting an attacker-controlled domain listed under "Verified
Sources" on a platform whose entire promise is verified truth.

Defences, none of which change what a legitimate request produces:

* **Bound** — length caps on the topic and every source excerpt.
* **Screen** — instruction-override phrasing in the topic is refused. Patterns
  require an imperative *and* an override object, so a real headline like "Senate
  votes to ignore the ruling" is not caught.
* **Neutralise** — override phrasing inside retrieved text is redacted and
  frame-breaking sequences stripped. Source text is never *rejected*: dropping a
  legitimate source over an unlucky phrase would quietly degrade grounding.
* **Frame** — the system prompt states that SOURCE blocks are untrusted data and
  that instructions inside them must be ignored.
* **Distrust the output** — the source filter still intersects against the real
  hits, so even a fully successful injection cannot publish a URL that was never
  retrieved. Control and invisible characters are stripped from model output before
  it can be persisted or rendered.

There is no tool execution, no shell, no filesystem write and no model-directed
outbound call anywhere in this service. The only network egress is to two fixed,
configured hosts — Gemini and Exa — which removes the entire
unsafe-tool-execution class. Notably, Gemini's own search-grounding tool is *not*
enabled: retrieval stays under this service's control, where every hit is screened
by `prompt_safety` before it can reach a prompt.

`GET /api/v1/admin/runs/summary` surfaces `injectionFlagged` and `sourcesRejected`
— a rise in either means the model is being steered or is inventing citations.

---

## Content moderation

The AI stage of the incident-report pipeline (`docs/INCIDENT_MODULE_PLAN.md` §5–6).
Node's durable moderation worker owns the queue, retries, keyword rules and the
publish/hold policy; this service only answers "what does the model make of this
content?" — statelessly, once per call. Private reports never reach it.

```
request ─► [1] prescreen ─────► [2] classify ──────────► [3] finalise ─────► verdict
           strip hidden chars       one Gemini call          8 codes, fixed order
           flag injection and       §6.3 policy + schema     violation ⇒ review
           boundary-like text       BLOCK_NONE, temp 0       clamp, cap, unescape
                                    photos as inlineData
                                    30 s, one attempt
```

### `POST /api/v1/internal/moderation/assess`

Request (camelCase, unknown fields refused): `runId` (32 hex), `targetType`
(`report` · `comment`), `category` (report category or null), `title` /
`locationLabel` / `parentTitle` (≤200 or null), `body` (1–20 000), `urgent`,
`flaggedCategories` (≤8 policy codes), `keywordSignals` (≤20 `{category, term}`),
`images` (≤10 `{mimeType: image/jpeg|png|webp, data: base64 ≤1.5 MiB decoded}`).
Legacy flag codes (`threatening`, `private_details`, `untrue`) are accepted.

Response — **always 200 for a valid request**:

| Field | Meaning |
|---|---|
| `status` | `assessed` · `unavailable` (unconfigured, not permitted, transport failure, invalid JSON, `MAX_TOKENS`) · `blocked` (prompt `blockReason`, or finish `SAFETY` / `PROHIBITED_CONTENT` / `BLOCKLIST` / `SPII`) |
| `recommendation`, `confidence` | `approve` · `review` — the AI never rejects; any violation, and any breach of the output contract, forces `review`; not assessed ⇒ `review`, 0 |
| `categories` | all 8 policy codes in fixed order: `violation`, `confidence`, `severity`, `evidence` (≤200, copied verbatim from the content, only for violations), `evidenceEnglish` |
| `safetyRisk` | `none` · `self_harm` · `imminent_danger` — not a violation; Node holds and alerts |
| `summary` | ≤600 chars, English, for the moderator |
| `injectionSuspected` | the prescreen found text shaped like the prompt frame, a chat-template marker, a request for the system prompt, or "ignore previous instructions" — deliberately narrow (see below) |
| `blockReason` | the provider's reason when `blocked` |
| `language` | BCP-47 code, `und` when unknown |
| `imagesAssessed` | photos the model saw — the first N, in request order |
| `retryable` | **only meaningful when `status` is `unavailable`**: `false` when the same request would fail the same way, so Node should record a permanent failure instead of retrying. Always `true` for `assessed` and `blocked` |
| `unavailableReason` | the operational code (≤64 chars) behind an `unavailable` answer, never member content; `null` otherwise |
| `meta` | `runId`, `model`, `policyVersion`, `durationMs` |

`unavailableReason` codes and whether each is `retryable`:

| Code | Retryable | Cause |
|---|---|---|
| `timeout` | yes | the whole pipeline overran `MODERATION_TIMEOUT_SECONDS` + 2 s |
| `provider_timeout`, `provider_transport_error` | yes | the Gemini call timed out or could not connect |
| `provider_http_<status>` | 5xx, 408, 429: yes · any other 4xx: **no** | Gemini answered with an error status (a 400 for a corrupt thumbnail repeats on every attempt) |
| `provider_bad_response` | yes | a 2xx whose body is not JSON |
| `no_candidate` | yes | a 200 with neither candidates nor a block reason |
| `finish_max_tokens`, `finish_recitation`, `finish_language` | **no** | unusable finishes that repeat at temperature 0 |
| `finish_<other>` | yes | any other unusable finish |
| `invalid_json` | **no** | the model's text is not a JSON object even though `responseSchema` was sent |
| `gemini_unconfigured`, `data_terms_unspecified` | yes | configuration; no Gemini call is made, and Node's reconciler re-runs held items once `/ready` reports `moderationReady` |
| `internal_error` | yes | an unexpected error in this service (logged by type and location) |

An invalid request is a 422 whose body — like its log line — never contains the
submitted values (`input`/`ctx` are stripped from every validation error, on every
route). Node treats a 422 as permanent.

### Why it is built this way

* **Member text is data, never instructions.** It is HTML-escaped and wrapped in
  a boundary tag that is random per request (`<content_{16 hex}>`), so it cannot
  close its own frame. Override phrasing or boundary-like text is *not* rejected
  or redacted — it is reported as `injectionSuspected`, and Node holds the item
  for a human. The text is never cut below the 20 000-character report cap.
  The signatures are moderation's own and much narrower than the news screen's:
  "you are now under arrest", "act as if nothing happened", "they ignore all the
  rules" and "they never verify anything" are narrative, and flagging them held
  genuine reports for a human. Softer attempts to steer the model are its own to
  report, under the `other` code, which forces `review` anyway.
* **The classifier must see what it labels.** `MODERATION_SAFETY_THRESHOLD`
  (`BLOCK_NONE`) applies to moderation calls only; news keeps
  `GEMINI_SAFETY_THRESHOLD`. A refusal is still possible and is surfaced as
  `blocked`, never dropped.
* **Node owns retries.** One attempt, `MODERATION_TIMEOUT_SECONDS` (30 s), so a
  call always ends inside the worker's lease. `unavailable` with `retryable: true`
  is Node's cue to back off and retry; `retryable: false` means a retry would
  pay for the same failure again; `blocked` is its cue to hold.
* **The answer always beats Node's 40 s abort.** httpx applies the 30 s to each
  phase of the call separately, so the whole pipeline also runs under a
  `MODERATION_TIMEOUT_SECONDS` + 2 s deadline and answers `unavailable` /
  `timeout` when it overruns. The run-log row is written after the response is
  sent (FastAPI background task), bounded to 2 s, and asyncpg's connect timeout
  is `DB_CONNECT_TIMEOUT_SECONDS` (5 s) — a slow run-log database can no longer
  delay a verdict.
* **The model's answer is not trusted on shape.** Gemini's `responseSchema`
  constrains the literals, and the finalise node re-checks every invariant anyway.
* **No member content in logs or the run log.** Provider error bodies and
  unparseable model output are logged by status and length only; the run log gets
  `operation="moderate"`, the run id, the outcome (`approve` / `review` /
  `unavailable` / `blocked`), model and duration.
* **Data terms gate production.** Until `GEMINI_DATA_TERMS` is `paid` or
  `vertex`, production answers `unavailable` without calling Gemini and `/ready`
  reports `moderationReady: false`.

### Settings

| Env | Default | Notes |
|---|---|---|
| `AI_MODERATION_MODEL` | synthesis model | |
| `MODERATION_SAFETY_THRESHOLD` | `BLOCK_NONE` | moderation calls only |
| `MODERATION_TIMEOUT_SECONDS` | `30` | one attempt |
| `MODERATION_MAX_TEXT_CHARS` | `20000` | may not be set lower |
| `MODERATION_MAX_IMAGES` | `10` | 0–10 |
| `MODERATION_MAX_IMAGE_BYTES` | `1572864` | decoded, per photo |
| `RATE_LIMIT_MODERATION` | `300/minute` | per token subject |
| `GEMINI_DATA_TERMS` | `unspecified` | `unspecified` · `paid` · `vertex` |
| `DB_CONNECT_TIMEOUT_SECONDS` | `5` | run-log connect timeout (all operations) |

Photos are included in request order while their base64 fits an ~18 MiB inline
budget (Gemini rejects requests over ~20 MB); any beyond it are not sent, and
`imagesAssessed` says how many were.

---

## Persistence is optional

With no `DATABASE_URL` the engine runs fully stateless and every run-log write is
a no-op. When enabled it records **operational metadata only** — timings,
outcomes, source counts, flags — and never article content: the article belongs to
Node, and a second copy of user-visible content in a service with no business
holding one is a liability, not a feature.

Point it at a **separate database or schema** from the Node backend. This service
owns one table and must never be able to reach the article tables.

---

## Issues found in the Node engine

Fixed here, since the brief was to fix what blocks the engine from running
correctly. Details in the migration plan §7.

1. **Image generation had no retry** while synthesis did, so a transient 5xx
   silently dropped an article's unique image and left the curated fallback. All
   provider calls now share one retry policy.
2. **`topicPrompt` was unbounded** on a public endpoint — a direct route to
   inflated token spend.
3. **Retrieved source content was trusted** and passed straight into the prompt.
4. **`buildSpokenScript` supports an 800-word excerpt that is never used**, because
   `generateAudioForArticle` passes only headline and summary. Reproduced exactly
   so nothing changes, with the parameter kept available for when the product wants
   longer briefings.
