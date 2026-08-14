"""Daily topic seeds — the rotation the scheduler runs through.

Ported verbatim from `blacknexa-backend/src/data/daily_prompts.data.ts`. Each entry
is written as a *search query* rather than a headline, because it is fed to Exa
first: the wording is tuned to return current, real results, not to read well.

The rotation is deterministic on the UTC day index, so a given day always produces
the same batch. That is what makes `POST /news/refresh-daily` idempotent and lets
Node skip anything it already published today.

60 prompts across 8 categories.
"""

from __future__ import annotations

import time

from app.schemas.news import SeedPrompt

#: Prompts per daily cycle. 30 across all categories ensures 20+ stories
#: publish even when several generations fail.
DAILY_BATCH_SIZE = 30

#: Milliseconds in a day. The day index is `epoch_ms // DAY_MS`, matching Node.
DAY_MS = 86_400_000

DAILY_PROMPTS: list[SeedPrompt] = [
    SeedPrompt(prompt="Black-owned business grants and federal funding announcements 2026", category="business-wealth-stewardship", scope="national"),
    SeedPrompt(prompt="African diaspora entrepreneurs raising capital or expanding globally 2026", category="business-wealth-stewardship", scope="global"),
    SeedPrompt(prompt="Community development financial institutions funding Black neighborhoods 2026", category="business-wealth-stewardship", scope="local"),
    SeedPrompt(prompt="Black women founders securing venture or non-dilutive funding 2026", category="business-wealth-stewardship", scope="national"),
    SeedPrompt(prompt="Black-owned bank charter applications and minority depository institution news 2026", category="business-wealth-stewardship", scope="national"),
    SeedPrompt(prompt="Caribbean and African trade agreements boosting Black-owned export businesses 2026", category="business-wealth-stewardship", scope="global"),
    SeedPrompt(prompt="Local Black business corridor revitalization and small business grants 2026", category="business-wealth-stewardship", scope="local"),
    SeedPrompt(prompt="Supplier diversity programs and corporate procurement contracts for Black businesses 2026", category="business-wealth-stewardship", scope="national"),
    SeedPrompt(prompt="Housing equity and land ownership policy for Black communities 2026", category="local-national-politics-civic", scope="local"),
    SeedPrompt(prompt="Federal civil rights enforcement actions HUD DOJ 2026", category="local-national-politics-civic", scope="national"),
    SeedPrompt(prompt="Reparations or racial justice policy progress internationally 2026", category="local-national-politics-civic", scope="global"),
    SeedPrompt(prompt="Voting rights and municipal equity legislation 2026", category="local-national-politics-civic", scope="national"),
    SeedPrompt(prompt="Police accountability and criminal justice reform legislation 2026", category="local-national-politics-civic", scope="national"),
    SeedPrompt(prompt="Black mayors and municipal leaders shaping city policy 2026", category="local-national-politics-civic", scope="local"),
    SeedPrompt(prompt="Skilled trades apprenticeship and youth employment programs 2026", category="education-youth-advancement", scope="local"),
    SeedPrompt(prompt="Global education access initiatives for African and Caribbean youth 2026", category="education-youth-advancement", scope="global"),
    SeedPrompt(prompt="Scholarship and fellowship programs for Black students 2026", category="education-youth-advancement", scope="national"),
    SeedPrompt(prompt="STEM and coding bootcamp outcomes for underrepresented youth 2026", category="education-youth-advancement", scope="national"),
    SeedPrompt(prompt="Black teacher recruitment and retention programs 2026", category="education-youth-advancement", scope="national"),
    SeedPrompt(prompt="Mentorship and leadership development programs for Black youth 2026", category="education-youth-advancement", scope="local"),
    SeedPrompt(prompt="Black founders in clean energy and AI technology 2026", category="clean-tech-and-advancements", scope="national"),
    SeedPrompt(prompt="Sustainable infrastructure and green tech investments in Africa 2026", category="clean-tech-and-advancements", scope="global"),
    SeedPrompt(prompt="Community-owned broadband and solar projects in Black neighborhoods 2026", category="clean-tech-and-advancements", scope="local"),
    SeedPrompt(prompt="Federal clean technology grants and SBIR awards to minority founders 2026", category="clean-tech-and-advancements", scope="national"),
    SeedPrompt(prompt="AI ethics and algorithmic bias policy affecting Black communities 2026", category="clean-tech-and-advancements", scope="national"),
    SeedPrompt(prompt="Climate resilience and adaptation funding for African and Caribbean nations 2026", category="clean-tech-and-advancements", scope="global"),
    SeedPrompt(prompt="Faith leaders community covenant and family restoration initiatives 2026", category="faith-commandments-morality", scope="national"),
    SeedPrompt(prompt="Global faith-based justice and reconciliation movements 2026", category="faith-commandments-morality", scope="global"),
    SeedPrompt(prompt="Restorative justice and reentry support programs led by churches 2026", category="faith-commandments-morality", scope="local"),
    SeedPrompt(prompt="Interfaith coalitions advancing equity and dignity 2026", category="faith-commandments-morality", scope="national"),
    SeedPrompt(prompt="African faith leaders addressing poverty and community development 2026", category="faith-commandments-morality", scope="global"),
    SeedPrompt(prompt="Faith-based mental health and wellness programs in Black communities 2026", category="faith-commandments-morality", scope="local"),
    SeedPrompt(prompt="HBCU funding grants federal and philanthropic announcements 2026", category="hbcu-education", scope="national"),
    SeedPrompt(prompt="HBCU STEM research programs and partnerships 2026", category="hbcu-education", scope="national"),
    SeedPrompt(prompt="HBCU athletics and student achievements 2026", category="hbcu-education", scope="national"),
    SeedPrompt(prompt="HBCU alumni impact and giving campaigns 2026", category="hbcu-education", scope="national"),
    SeedPrompt(prompt="HBCU partnerships with tech companies and internship pipelines 2026", category="hbcu-education", scope="national"),
    SeedPrompt(prompt="HBCU campus expansions capital projects and new facilities 2026", category="hbcu-education", scope="local"),
    SeedPrompt(prompt="HBCU marching bands and cultural programs spotlight 2026", category="hbcu-education", scope="national"),
    SeedPrompt(prompt="HBCU law schools and medical programs producing Black professionals 2026", category="hbcu-education", scope="national"),
    SeedPrompt(prompt="Major breaking geopolitical events United States policy 2026", category="breaking-geopolitical", scope="national"),
    SeedPrompt(prompt="Breaking international diplomacy and conflict developments 2026", category="breaking-geopolitical", scope="global"),
    SeedPrompt(prompt="Global economic shifts trade agreements sanctions 2026", category="breaking-geopolitical", scope="global"),
    SeedPrompt(prompt="United States Congress major legislation and policy actions 2026", category="breaking-geopolitical", scope="national"),
    SeedPrompt(prompt="International elections and democratic transitions 2026", category="breaking-geopolitical", scope="global"),
    SeedPrompt(prompt="Climate diplomacy and global environmental summits 2026", category="breaking-geopolitical", scope="global"),
    SeedPrompt(prompt="African Union and pan-African political developments 2026", category="breaking-geopolitical", scope="global"),
    SeedPrompt(prompt="Caribbean Community CARICOM policy and economic integration 2026", category="breaking-geopolitical", scope="global"),
    SeedPrompt(prompt="United Nations resolutions affecting African diaspora communities 2026", category="breaking-geopolitical", scope="global"),
    SeedPrompt(prompt="Supreme Court rulings and federal judiciary decisions impacting civil rights 2026", category="breaking-geopolitical", scope="national"),
    SeedPrompt(prompt="Police accountability consent decrees DOJ investigations city police departments 2026", category="civil-rights-police-accountability", scope="national"),
    SeedPrompt(prompt="Wrongful arrest settlement restitution civil rights lawsuits Black communities 2026", category="civil-rights-police-accountability", scope="local"),
    SeedPrompt(prompt="Anti-discrimination employment lawsuits EEOC rulings Black workers 2026", category="civil-rights-police-accountability", scope="national"),
    SeedPrompt(prompt="Voting rights litigation gerrymandering redistricting Black districts 2026", category="civil-rights-police-accountability", scope="national"),
    SeedPrompt(prompt="Housing discrimination complaints HUD enforcement actions landlords banks 2026", category="civil-rights-police-accountability", scope="local"),
    SeedPrompt(prompt="Racial profiling traffic stop data transparency legislation body camera mandates 2026", category="civil-rights-police-accountability", scope="national"),
    SeedPrompt(prompt="Civil rights attorney general interventions hate crime prosecutions 2026", category="civil-rights-police-accountability", scope="national"),
    SeedPrompt(prompt="School discipline racial equity federal investigations Black students 2026", category="civil-rights-police-accountability", scope="local"),
    SeedPrompt(prompt="International racial justice movements reparations commissions progress 2026", category="civil-rights-police-accountability", scope="global"),
    SeedPrompt(prompt="Qualified immunity reform legislation police officer accountability state laws 2026", category="civil-rights-police-accountability", scope="national"),
]


def day_index_at(epoch_ms: int | None = None) -> int:
    """Whole days since the Unix epoch — stable across a whole UTC calendar day.

    Ports `dayIndexAt()`.
    """
    if epoch_ms is None:
        epoch_ms = int(time.time() * 1000)
    return epoch_ms // DAY_MS


def pick_daily_batch(day_index: int, count: int = DAILY_BATCH_SIZE) -> list[SeedPrompt]:
    """Deterministically select the batch for a day index.

    Ports `pickDailyBatch()`: start at `(day_index * count) % len(prompts)` and take
    `count` entries, wrapping. The pool is larger than one batch, so the feed
    advances daily without repeating within a cycle.
    """
    total = len(DAILY_PROMPTS)
    if total == 0 or count <= 0:
        return []
    start = (day_index * count) % total
    return [DAILY_PROMPTS[(start + i) % total] for i in range(count)]
