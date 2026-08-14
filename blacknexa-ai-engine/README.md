# BlackNexa AI News Engine

Python · FastAPI · Pydantic · httpx · SQLAlchemy

The AI generation engine for BlackNexa news: grounded web search, briefing
synthesis, photojournalistic imagery, TTS audio and 19-language translation.

Extracted from the Node backend's in-process AI layer. **Every public and admin
endpoint still lives in `blacknexa-backend`** — this service is internal, called
server-to-server, and never reachable by a client.

Boundary, contract and the reasoning behind both:
[`docs/AI_ENGINE_MIGRATION_PLAN.md`](docs/AI_ENGINE_MIGRATION_PLAN.md).

---

## Quick start

```bash
cp .env.example .env       # set SERVICE_JWT_SECRET, and AI_TOOLKIT_SECRET_KEY to generate
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
  api/v1/internal/   news routes — service-token auth
  api/v1/admin/      run-log observability — role-gated
  core/              config, logging, security, errors, prompt_safety
  ai/
    graph.py         the pipeline runner
    state.py         typed state threaded between nodes
    nodes/           search → synthesis → source_filter → image
    prompts/         verbatim ports of the editorial prompts + daily rotation
  integrations/
    search/exa.py    grounded web search
    llm/chat.py      chat-completions + defensive JSON extraction
    llm/image.py     multimodal image generation
    audio/tts.py     speech synthesis
    gateway.py       shared transport with retry/timeout parity
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

Plus `/api/v1/admin/runs`, `/runs/summary`, `/runs/prune`, and unauthenticated
`/health` and `/ready`.

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

Two untrusted inputs reach the model, and **neither was screened in the Node
engine**:

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
outbound call anywhere in this service. The only network egress is the configured
gateway, which removes the entire unsafe-tool-execution class.

`GET /api/v1/admin/runs/summary` surfaces `injectionFlagged` and `sourcesRejected`
— a rise in either means the model is being steered or is inventing citations.

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
   gateway calls now share one retry policy.
2. **`topicPrompt` was unbounded** on a public endpoint — a direct route to
   inflated token spend.
3. **Retrieved source content was trusted** and passed straight into the prompt.
4. **`buildSpokenScript` supports an 800-word excerpt that is never used**, because
   `generateAudioForArticle` passes only headline and summary. Reproduced exactly
   so nothing changes, with the parameter kept available for when the product wants
   longer briefings.
