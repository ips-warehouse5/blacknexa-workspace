"""Moderation node 1 — deterministic prescreen.

Runs `prompt_safety.screen_user_content` over every member-written field before
anything is spent (INCIDENT_MODULE_PLAN.md §6.2):

* control and invisible characters are removed, so the model and the human
  moderator read the same words;
* instruction-override phrasing and text shaped like the prompt's own frame are
  recorded as `injection_signals`, surfaced to Node as `injectionSuspected`.
  The signature set is moderation's own narrow one, not the news screen's:
  "you are now under arrest" or "they never verify anything" is narrative, and
  a signal holds the item for a human (review R18).

It never rejects and never shortens a field below the 20 000-character report
cap: an injection attempt inside a report is itself something a moderator must
see, so it becomes a hold signal (plan §5.3, `injection_suspected`) and blocks any
auto-hide on flagged content (decision D8) — it is not a reason to return no
verdict. Keyword-signal terms are not screened for injection: they are Node's
rule terms, not member prose, and only lose hostile characters.

Only signature *names* are logged, never the text.
"""

from __future__ import annotations

from app.ai.moderation_state import ModerationState
from app.core.logging import get_logger
from app.core.prompt_safety import sanitise_model_text, screen_user_content

logger = get_logger(__name__)


def _screen(text: str | None, signals: set[str]) -> str | None:
    """Screened text (None when absent or empty), recording any signals."""
    if text is None:
        return None
    result = screen_user_content(text)
    signals.update(result.matched_patterns)
    return result.text if result.text.strip() else None


async def run(state: ModerationState) -> ModerationState:
    """Clean member text in place and record injection signals."""
    if state.failed:
        return state

    signals: set[str] = set()

    # The body is required by the contract; if only hostile characters were
    # sent it becomes empty, and the model is left to judge an empty report
    # ("content you cannot understand" → review) rather than being skipped.
    state.body = _screen(state.body, signals) or ""
    state.title = _screen(state.title, signals)
    state.location_label = _screen(state.location_label, signals)
    state.parent_title = _screen(state.parent_title, signals)

    state.keyword_signals = [
        (code, cleaned)
        for code, term in state.keyword_signals
        if (cleaned := sanitise_model_text(term))
    ]

    state.injection_signals = tuple(sorted(signals))

    if signals:
        logger.warning(
            "moderation_injection_signal",
            target_type=state.target_type,
            patterns=list(state.injection_signals),
        )
    logger.info(
        "moderation_prescreen_complete",
        target_type=state.target_type,
        body_chars=len(state.body),
        has_title=state.title is not None,
        signals=len(state.injection_signals),
    )
    return state
