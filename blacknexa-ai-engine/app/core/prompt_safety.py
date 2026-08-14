"""Prompt-injection defences.

Two untrusted inputs reach the synthesis model, and neither is screened in the
Node engine this service replaces:

1. **`topicPrompt`** — supplied through `POST /api/v1/news/generate`, which is
   public and unauthenticated.
2. **Retrieved web content** — Exa returns `title` and `highlights` from live
   pages. Anyone who can get a page indexed for a topic BlackNexa covers can put
   text in it, and that text lands in the prompt inside a `SOURCE n` block. This
   is the more dangerous of the two, because it needs no access to the API at all.

The realistic damage is not "leak the system prompt" — it is an attacker steering
a *published, fact-checked-looking* article: injecting fabricated claims,
attributing them to a real outlet, or getting an attacker-controlled URL listed
under "Verified Sources" on a platform whose whole promise is verified truth.

Defence in depth, none of which changes what a legitimate request produces:

* **Bound the input.** Length caps on the topic and on every source excerpt.
* **Screen the topic.** Instruction-override phrasing is refused (or neutralised
  when `REJECT_SUSPICIOUS_PROMPTS` is off).
* **Neutralise retrieved text.** Override phrasing inside source content is
  defanged, and fenced/delimiter sequences that could close the data block are
  stripped so a source cannot escape its frame.
* **Frame it as data.** The system prompt states that source blocks are untrusted
  data and that instructions inside them must be ignored.
* **Distrust the output.** Cited URLs are still intersected with the real Exa hits
  downstream, and each is re-validated — so even a fully successful injection
  cannot introduce a source that was not actually retrieved.

There is no tool execution, no shell, no filesystem write and no model-directed
outbound call anywhere in this engine; the only network egress is to the
configured gateway. That removes the entire "unsafe tool execution" class.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from urllib.parse import urlparse

from app.core.config import settings
from app.core.errors import PromptRejectedError
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Injection signatures ─────────────────────────────────────────────────────
#
# Deliberately targeted at instruction-override phrasing rather than general
# keywords. A news topic legitimately contains words like "system", "prompt" or
# "ignore" ("Senate votes to ignore the ruling"), so matching those alone would
# reject real work. Each pattern needs an imperative plus an override object.

_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(?:ignore|disregard|forget|override|bypass)\b[\s\S]{0,40}?"
        r"\b(?:previous|prior|earlier|above|all)\b[\s\S]{0,20}?"
        r"\b(?:instruction|prompt|rule|direction|context|message)s?\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|roleplay\s+as|"
        r"from\s+now\s+on\s+you)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:system|developer|assistant)\s*(?:prompt|message|instruction)s?\b"
        r"[\s\S]{0,30}?\b(?:reveal|show|print|output|repeat|disclose|ignore)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:reveal|show|print|output|repeat|disclose)\b[\s\S]{0,30}?"
        r"\b(?:system|developer)\s*(?:prompt|message|instruction)s?\b",
        re.IGNORECASE,
    ),
    # Chat-template markers: a source page containing these could otherwise be
    # read as a role boundary by some providers.
    re.compile(r"<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>", re.IGNORECASE),
    re.compile(r"^\s*(?:system|assistant|developer)\s*:", re.IGNORECASE | re.MULTILINE),
    # Steering the output contract itself.
    re.compile(
        r"\b(?:do\s+not|don't|never)\b[\s\S]{0,30}?\b(?:cite|verify|fact[-\s]?check|"
        r"use\s+the\s+sources?)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:add|insert|include)\b[\s\S]{0,30}?\b(?:this|the\s+following)\s+"
        r"(?:url|link|source|domain)\b",
        re.IGNORECASE,
    ),
)

# Sequences that could terminate the data frame around a source block.
_FRAME_BREAKERS: tuple[re.Pattern[str], ...] = (
    re.compile(r"`{3,}"),
    re.compile(r"-{4,}\s*(?:end|begin|start)\b[^\n]*", re.IGNORECASE),
    re.compile(r"\[/?(?:INST|SYS|SYSTEM)\]", re.IGNORECASE),
    re.compile(r"</?(?:system|instructions?|prompt)>", re.IGNORECASE),
    re.compile(r"^\s*#{1,6}\s*(?:system|instruction)", re.IGNORECASE | re.MULTILINE),
)

_REDACTION = "[redacted-directive]"

# Control characters (except tab/newline/CR) — invisible steering and log noise.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# Zero-width and bidirectional-override characters. These can hide text from a
# human reviewer while the model still reads it.
_INVISIBLE_CHARS = re.compile(
    "["
    "\u200b-\u200f"  # zero-width space/joiners, LRM/RLM
    "\u202a-\u202e"  # bidirectional embedding and override
    "\u2060-\u2064"  # word joiner, invisible operators
    "\ufeff"          # zero-width no-break space / BOM
    "]"
)


@dataclass(frozen=True)
class ScreenResult:
    """Outcome of screening one piece of untrusted text."""

    text: str
    suspicious: bool
    matched_patterns: tuple[str, ...]

    @property
    def clean(self) -> bool:
        return not self.suspicious


def _strip_hostile_characters(text: str) -> str:
    """Remove control and invisible characters used to smuggle instructions."""
    return _INVISIBLE_CHARS.sub("", _CONTROL_CHARS.sub("", text))


def _find_injection_patterns(text: str) -> tuple[str, ...]:
    """Names of every injection signature the text trips."""
    hits: list[str] = []
    for index, pattern in enumerate(_INJECTION_PATTERNS):
        if pattern.search(text):
            hits.append(f"injection_{index}")
    return tuple(hits)


def screen_topic_prompt(raw: str) -> str:
    """Validate and clean a caller-supplied topic prompt.

    Raises `PromptRejectedError` when the topic carries instruction-override
    phrasing and `REJECT_SUSPICIOUS_PROMPTS` is on. Rejecting is the right default
    for this field: a legitimate news topic never needs to tell the model to
    disregard its instructions, so a match is far more likely an attack than a
    false positive.
    """
    if not raw or not raw.strip():
        raise PromptRejectedError("topicPrompt must not be empty.")

    text = _strip_hostile_characters(raw).strip()

    if len(text) > settings.max_topic_prompt_chars:
        # Bounded before anything is spent: an oversized prompt on a public,
        # unauthenticated endpoint is a direct route to inflated token cost.
        raise PromptRejectedError(
            f"topicPrompt exceeds the {settings.max_topic_prompt_chars} character limit."
        )

    matched = _find_injection_patterns(text)
    if matched:
        logger.warning(
            "topic_prompt_flagged",
            patterns=list(matched),
            preview=text[:120],
        )
        if settings.reject_suspicious_prompts:
            raise PromptRejectedError(
                "The supplied topic was rejected by the prompt-safety screen."
            )
        text = neutralise_untrusted_text(text).text

    return text


def neutralise_untrusted_text(raw: str) -> ScreenResult:
    """Defang retrieved web content so it cannot act as instructions.

    Source text is *never* rejected — dropping a legitimate source because a page
    happened to contain an unlucky phrase would quietly reduce grounding quality,
    which is worse than neutralising it. Instead the directive phrasing is
    replaced and frame-breaking sequences are removed, so the content still
    contributes facts but cannot issue commands.
    """
    text = _strip_hostile_characters(raw)
    matched = _find_injection_patterns(text)

    for pattern in _INJECTION_PATTERNS:
        text = pattern.sub(_REDACTION, text)
    for pattern in _FRAME_BREAKERS:
        text = pattern.sub(" ", text)

    # Collapse the whitespace the substitutions leave behind.
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    if len(text) > settings.max_source_excerpt_chars:
        text = text[: settings.max_source_excerpt_chars].rstrip() + "…"

    return ScreenResult(text=text, suspicious=bool(matched), matched_patterns=matched)


# ── URL validation ───────────────────────────────────────────────────────────

_ALLOWED_SCHEMES = frozenset({"http", "https"})


def is_safe_source_url(url: str) -> bool:
    """True when a URL is safe to cite publicly.

    Applied to every URL before it can appear under "Verified Sources". Rejects
    non-HTTP schemes (`javascript:`, `data:`, `file:`) and any host that resolves
    to a literal private, loopback, link-local or reserved address — an SSRF-style
    guard, and equally a guard against publishing an internal hostname in a public
    article.
    """
    if not url or len(url) > 2048:
        return False

    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False

    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        return False
    if not parsed.netloc or not parsed.hostname:
        return False

    hostname = parsed.hostname.lower()
    if hostname in {"localhost", "localhost.localdomain"}:
        return False

    # Literal IPs get checked directly. Hostnames are left to DNS at fetch time —
    # this engine never fetches them, it only cites them.
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return True

    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def sanitise_model_text(raw: str, *, max_chars: int | None = None) -> str:
    """Clean a text field that came back from the model.

    Model output is untrusted too: it is derived from attacker-influenceable
    sources and is about to be persisted and rendered. Control and invisible
    characters are stripped so nothing invisible reaches the database, the feed,
    or the server-rendered article page.
    """
    text = _strip_hostile_characters(raw or "").strip()
    if max_chars is not None and len(text) > max_chars:
        text = text[:max_chars].rstrip()
    return text
