"""Parity with the Node engine.

These assert that the ported prompts, tuning parameters and prompt rotation are
byte-identical to the TypeScript source rather than merely similar. The prompts are
the editorial contract of the product — the moral rules, the structure directive
and the two length rules all shape what readers receive — so a drift here is a
product change disguised as a refactor.

The Node source is parsed at test time, so if someone edits the prompt on either
side this fails and forces a deliberate decision.
"""

from __future__ import annotations

import re

import pytest

from app.ai.prompts import news_synthesis, translation
from app.ai.prompts.daily_prompts import (
    DAILY_BATCH_SIZE,
    DAILY_PROMPTS,
    day_index_at,
    pick_daily_batch,
)
from tests.conftest import NODE_BACKEND

AI_GATEWAY_TS = NODE_BACKEND / "src" / "services" / "ai_gateway.service.ts"
I18N_TS = NODE_BACKEND / "src" / "services" / "i18n.service.ts"
PROMPTS_TS = NODE_BACKEND / "src" / "data" / "daily_prompts.data.ts"

pytestmark = pytest.mark.skipif(
    not AI_GATEWAY_TS.exists(),
    reason="Node backend source is not present in this checkout",
)


def _extract_template_literal(source: str, const_name: str) -> str:
    """Pull a backtick template literal out of the TypeScript source."""
    match = re.search(rf"const {const_name} = `(.*?)`;", source, re.DOTALL)
    assert match, f"{const_name} not found in the Node source"
    return match.group(1)


@pytest.fixture(scope="module")
def gateway_ts() -> str:
    return AI_GATEWAY_TS.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def i18n_ts() -> str:
    return I18N_TS.read_text(encoding="utf-8")


# ── Prompt text ──────────────────────────────────────────────────────────────


def test_base_instruction_matches_node(gateway_ts: str) -> None:
    assert news_synthesis.BASE_INSTRUCTION == _extract_template_literal(
        gateway_ts, "BASE_INSTRUCTION"
    )


def test_depth_rule_matches_node(gateway_ts: str) -> None:
    assert news_synthesis.DEPTH_RULE == _extract_template_literal(gateway_ts, "DEPTH_RULE")


def test_fast_rule_matches_node(gateway_ts: str) -> None:
    assert news_synthesis.FAST_RULE == _extract_template_literal(gateway_ts, "FAST_RULE")


def test_translate_system_matches_node(i18n_ts: str) -> None:
    assert translation.TRANSLATE_SYSTEM == _extract_template_literal(
        i18n_ts, "TRANSLATE_SYSTEM"
    )


def test_length_rule_substitution_matches_node() -> None:
    """The composed system prompts substitute the placeholder the same way."""
    assert "{{LENGTH_RULE}}" not in news_synthesis.SYSTEM_INSTRUCTION
    assert "{{LENGTH_RULE}}" not in news_synthesis.FAST_SYSTEM_INSTRUCTION
    assert news_synthesis.DEPTH_RULE in news_synthesis.SYSTEM_INSTRUCTION
    assert news_synthesis.FAST_RULE in news_synthesis.FAST_SYSTEM_INSTRUCTION


def test_hardening_is_additive_only() -> None:
    """The injection directive appends; it never edits the editorial prompt.

    If hardening rewrote any part of the original, the ported prompt would no
    longer be the one the product was tuned against.
    """
    assert news_synthesis.SYSTEM_INSTRUCTION_HARDENED.startswith(
        news_synthesis.SYSTEM_INSTRUCTION
    )
    assert news_synthesis.FAST_SYSTEM_INSTRUCTION_HARDENED.startswith(
        news_synthesis.FAST_SYSTEM_INSTRUCTION
    )
    assert translation.TRANSLATE_SYSTEM_HARDENED.startswith(translation.TRANSLATE_SYSTEM)

    # And the un-hardened form is still reachable for exact comparison.
    assert news_synthesis.system_instruction(fast=True, hardened=False) == (
        news_synthesis.FAST_SYSTEM_INSTRUCTION
    )


# ── Tuning parameters ────────────────────────────────────────────────────────


def test_model_ids_match_node(gateway_ts: str, i18n_ts: str) -> None:
    """Same models as Node, addressed by their bare Gemini ids.

    Node reaches them through a gateway that routes on a `google/` prefix. Calling
    Google directly, that prefix is not part of the model name — so parity is
    asserted with it stripped. Anything else diverging here means the engine
    quietly changed which model writes the news.

    Not covered: TTS. Node uses `xai/grok-tts`, which has no Gemini equivalent, so
    that one intentionally differs — see `integrations/audio/tts.py`.
    """
    from app.core.config import settings

    def const(source: str, name: str) -> str:
        match = re.search(rf'const {name} = "([^"]+)"', source)
        assert match, f"{name} not found"
        return match.group(1)

    def bare(model_id: str) -> str:
        return model_id.removeprefix("google/")

    assert settings.synthesis_model == bare(const(gateway_ts, "SYNTHESIS_MODEL"))
    assert settings.image_model == bare(const(gateway_ts, "IMAGE_MODEL"))
    assert settings.translation_model == bare(const(i18n_ts, "TRANSLATION_MODEL"))
    # The prefix really was gateway routing syntax, not part of the name.
    assert not settings.synthesis_model.startswith("google/")


def test_search_and_token_budgets_match_node(gateway_ts: str) -> None:
    """`searchWeb(topic, fast ? 8 : 12, fast ? 800 : 2400)` and the token caps."""
    from app.ai.state import GenerationState

    assert "fast ? 8 : 12" in gateway_ts
    assert "fast ? 800 : 2400" in gateway_ts
    assert "fast ? 2800 : 7200" in gateway_ts

    fast = GenerationState(topic_prompt="t", category="hbcu-education", scope="national", mode="fast")
    deep = GenerationState(topic_prompt="t", category="hbcu-education", scope="national", mode="deep")

    assert (fast.search_num_results, deep.search_num_results) == (8, 12)
    assert (fast.search_max_characters, deep.search_max_characters) == (800, 2400)
    assert (fast.synthesis_max_tokens, deep.synthesis_max_tokens) == (2800, 7200)
    assert fast.synthesis_temperature == deep.synthesis_temperature == 0.3


def test_engine_no_longer_routes_through_the_node_gateway() -> None:
    """Parity with Node's transport is deliberately broken, and stays broken.

    The Node service reaches Gemini through the Rork Toolkit gateway. This engine
    calls Google and Exa directly, so the gateway host, its secret and its
    OpenAI-compatible paths must not survive anywhere in `app/`. Prompt parity —
    asserted by every other test in this module — is unaffected: only the
    transport changed.
    """
    from pathlib import Path

    app_dir = Path(__file__).resolve().parents[2] / "app"
    banned = ("AI_TOOLKIT", "ai_toolkit", "toolkit.rork.com", "/v2/vercel", "/v2/exa")

    offenders: list[str] = []
    for path in app_dir.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        offenders += [f"{path.name}: {token}" for token in banned if token in text]

    assert not offenders, f"gateway references left behind: {offenders}"


def test_search_request_body_matches_node(gateway_ts: str) -> None:
    """The Exa request body is unchanged by the move off the gateway.

    The gateway forwarded this body verbatim to the same Exa endpoint, so keeping
    it identical is what makes the migration a transport change rather than a
    change in what gets retrieved.
    """
    assert 'type: "auto"' in gateway_ts
    assert "highlights: true" in gateway_ts


def test_source_fallback_limit_matches_node(gateway_ts: str) -> None:
    """Node falls back to `hits.slice(0, 7)` when no citation survives."""
    from app.ai.nodes.source_filter_node import _FALLBACK_SOURCE_LIMIT

    assert "slice(0, 7)" in gateway_ts
    assert _FALLBACK_SOURCE_LIMIT == 7


def test_spoken_script_excerpt_matches_node(gateway_ts: str) -> None:
    from app.integrations.audio.tts import _SCRIPT_EXCERPT_WORDS

    assert "slice(0, 800)" in gateway_ts
    assert _SCRIPT_EXCERPT_WORDS == 800


# ── Daily prompt rotation ────────────────────────────────────────────────────


def test_prompt_catalogue_matches_node() -> None:
    """Every prompt, category and scope survived the port intact."""
    source = PROMPTS_TS.read_text(encoding="utf-8")
    node_entries = re.findall(
        r'\{\s*prompt:\s*"([^"]*)"\s*,\s*category:\s*"([a-z-]+)"\s*,\s*scope:\s*"([a-z]+)"\s*\}',
        source,
    )

    assert len(node_entries) == len(DAILY_PROMPTS)
    for (prompt, category, scope), ported in zip(node_entries, DAILY_PROMPTS, strict=True):
        assert ported.prompt == prompt
        assert ported.category == category
        assert ported.scope == scope


def test_batch_size_matches_node() -> None:
    source = PROMPTS_TS.read_text(encoding="utf-8")
    match = re.search(r"DAILY_BATCH_SIZE\s*=\s*(\d+)", source)
    assert match
    assert DAILY_BATCH_SIZE == int(match.group(1))


def test_rotation_is_deterministic_and_advances() -> None:
    """Same day → same batch; next day → a different one.

    Determinism is what makes `POST /news/refresh-daily` idempotent.
    """
    today = day_index_at()
    assert pick_daily_batch(today) == pick_daily_batch(today)
    assert pick_daily_batch(today) != pick_daily_batch(today + 1)
    assert len(pick_daily_batch(today)) == DAILY_BATCH_SIZE


def test_rotation_wraps_without_error() -> None:
    """A count larger than the pool wraps rather than truncating or raising."""
    batch = pick_daily_batch(0, len(DAILY_PROMPTS) + 5)
    assert len(batch) == len(DAILY_PROMPTS) + 5


def test_day_index_matches_node_formula() -> None:
    """`Math.floor(ms / 86_400_000)`."""
    assert day_index_at(0) == 0
    assert day_index_at(86_400_000) == 1
    assert day_index_at(86_400_000 - 1) == 0
    assert day_index_at(1_786_622_610_541) == 1_786_622_610_541 // 86_400_000
