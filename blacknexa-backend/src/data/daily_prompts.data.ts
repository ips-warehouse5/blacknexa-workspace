/**
 * Daily topic seeds — the prompts the scheduler rotates through to keep the
 * feed global and category-balanced. Each entry maps to one article the daily
 * alarm will generate. Prompts are written as search queries so Exa returns
 * current, real results.
 */

import type { NewsCategory, NewsScope } from "@/types/news.interface";

export type SeedPrompt = {
  prompt: string;
  category: NewsCategory;
  scope: NewsScope;
};

/**
 * A rotating pool of prompts spanning all seven categories and all three
 * scopes. The scheduler picks the next batch deterministically from the date,
 * so the feed advances every day without repeats within a week.
 *
 * Categories:
 *  - business-wealth-stewardship
 *  - local-national-politics-civic
 *  - education-youth-advancement
 *  - clean-tech-and-advancements
 *  - faith-commandments-morality
 *  - hbcu-education                       (NEW — HBCUs)
 *  - breaking-geopolitical                (NEW — major world/US events)
 */
export const DAILY_PROMPTS: SeedPrompt[] = [
  // Business & Wealth — global + national + local (8 prompts)
  { prompt: "Black-owned business grants and federal funding announcements 2026", category: "business-wealth-stewardship", scope: "national" },
  { prompt: "African diaspora entrepreneurs raising capital or expanding globally 2026", category: "business-wealth-stewardship", scope: "global" },
  { prompt: "Community development financial institutions funding Black neighborhoods 2026", category: "business-wealth-stewardship", scope: "local" },
  { prompt: "Black women founders securing venture or non-dilutive funding 2026", category: "business-wealth-stewardship", scope: "national" },
  { prompt: "Black-owned bank charter applications and minority depository institution news 2026", category: "business-wealth-stewardship", scope: "national" },
  { prompt: "Caribbean and African trade agreements boosting Black-owned export businesses 2026", category: "business-wealth-stewardship", scope: "global" },
  { prompt: "Local Black business corridor revitalization and small business grants 2026", category: "business-wealth-stewardship", scope: "local" },
  { prompt: "Supplier diversity programs and corporate procurement contracts for Black businesses 2026", category: "business-wealth-stewardship", scope: "national" },

  // Civic & Policy (6 prompts)
  { prompt: "Housing equity and land ownership policy for Black communities 2026", category: "local-national-politics-civic", scope: "local" },
  { prompt: "Federal civil rights enforcement actions HUD DOJ 2026", category: "local-national-politics-civic", scope: "national" },
  { prompt: "Reparations or racial justice policy progress internationally 2026", category: "local-national-politics-civic", scope: "global" },
  { prompt: "Voting rights and municipal equity legislation 2026", category: "local-national-politics-civic", scope: "national" },
  { prompt: "Police accountability and criminal justice reform legislation 2026", category: "local-national-politics-civic", scope: "national" },
  { prompt: "Black mayors and municipal leaders shaping city policy 2026", category: "local-national-politics-civic", scope: "local" },

  // Education & Youth (6 prompts)
  { prompt: "Skilled trades apprenticeship and youth employment programs 2026", category: "education-youth-advancement", scope: "local" },
  { prompt: "Global education access initiatives for African and Caribbean youth 2026", category: "education-youth-advancement", scope: "global" },
  { prompt: "Scholarship and fellowship programs for Black students 2026", category: "education-youth-advancement", scope: "national" },
  { prompt: "STEM and coding bootcamp outcomes for underrepresented youth 2026", category: "education-youth-advancement", scope: "national" },
  { prompt: "Black teacher recruitment and retention programs 2026", category: "education-youth-advancement", scope: "national" },
  { prompt: "Mentorship and leadership development programs for Black youth 2026", category: "education-youth-advancement", scope: "local" },

  // Clean Tech & Innovation (6 prompts)
  { prompt: "Black founders in clean energy and AI technology 2026", category: "clean-tech-and-advancements", scope: "national" },
  { prompt: "Sustainable infrastructure and green tech investments in Africa 2026", category: "clean-tech-and-advancements", scope: "global" },
  { prompt: "Community-owned broadband and solar projects in Black neighborhoods 2026", category: "clean-tech-and-advancements", scope: "local" },
  { prompt: "Federal clean technology grants and SBIR awards to minority founders 2026", category: "clean-tech-and-advancements", scope: "national" },
  { prompt: "AI ethics and algorithmic bias policy affecting Black communities 2026", category: "clean-tech-and-advancements", scope: "national" },
  { prompt: "Climate resilience and adaptation funding for African and Caribbean nations 2026", category: "clean-tech-and-advancements", scope: "global" },

  // Faith & Morality (6 prompts)
  { prompt: "Faith leaders community covenant and family restoration initiatives 2026", category: "faith-commandments-morality", scope: "national" },
  { prompt: "Global faith-based justice and reconciliation movements 2026", category: "faith-commandments-morality", scope: "global" },
  { prompt: "Restorative justice and reentry support programs led by churches 2026", category: "faith-commandments-morality", scope: "local" },
  { prompt: "Interfaith coalitions advancing equity and dignity 2026", category: "faith-commandments-morality", scope: "national" },
  { prompt: "African faith leaders addressing poverty and community development 2026", category: "faith-commandments-morality", scope: "global" },
  { prompt: "Faith-based mental health and wellness programs in Black communities 2026", category: "faith-commandments-morality", scope: "local" },

  // HBCUs (8 prompts)
  { prompt: "HBCU funding grants federal and philanthropic announcements 2026", category: "hbcu-education", scope: "national" },
  { prompt: "HBCU STEM research programs and partnerships 2026", category: "hbcu-education", scope: "national" },
  { prompt: "HBCU athletics and student achievements 2026", category: "hbcu-education", scope: "national" },
  { prompt: "HBCU alumni impact and giving campaigns 2026", category: "hbcu-education", scope: "national" },
  { prompt: "HBCU partnerships with tech companies and internship pipelines 2026", category: "hbcu-education", scope: "national" },
  { prompt: "HBCU campus expansions capital projects and new facilities 2026", category: "hbcu-education", scope: "local" },
  { prompt: "HBCU marching bands and cultural programs spotlight 2026", category: "hbcu-education", scope: "national" },
  { prompt: "HBCU law schools and medical programs producing Black professionals 2026", category: "hbcu-education", scope: "national" },

  // Breaking Geopolitical (10 prompts)
  { prompt: "Major breaking geopolitical events United States policy 2026", category: "breaking-geopolitical", scope: "national" },
  { prompt: "Breaking international diplomacy and conflict developments 2026", category: "breaking-geopolitical", scope: "global" },
  { prompt: "Global economic shifts trade agreements sanctions 2026", category: "breaking-geopolitical", scope: "global" },
  { prompt: "United States Congress major legislation and policy actions 2026", category: "breaking-geopolitical", scope: "national" },
  { prompt: "International elections and democratic transitions 2026", category: "breaking-geopolitical", scope: "global" },
  { prompt: "Climate diplomacy and global environmental summits 2026", category: "breaking-geopolitical", scope: "global" },
  { prompt: "African Union and pan-African political developments 2026", category: "breaking-geopolitical", scope: "global" },
  { prompt: "Caribbean Community CARICOM policy and economic integration 2026", category: "breaking-geopolitical", scope: "global" },
  { prompt: "United Nations resolutions affecting African diaspora communities 2026", category: "breaking-geopolitical", scope: "global" },
  { prompt: "Supreme Court rulings and federal judiciary decisions impacting civil rights 2026", category: "breaking-geopolitical", scope: "national" },

  // Civil Rights, Police Accountability & Anti-Discrimination (10 prompts)
  { prompt: "Police accountability consent decrees DOJ investigations city police departments 2026", category: "civil-rights-police-accountability", scope: "national" },
  { prompt: "Wrongful arrest settlement restitution civil rights lawsuits Black communities 2026", category: "civil-rights-police-accountability", scope: "local" },
  { prompt: "Anti-discrimination employment lawsuits EEOC rulings Black workers 2026", category: "civil-rights-police-accountability", scope: "national" },
  { prompt: "Voting rights litigation gerrymandering redistricting Black districts 2026", category: "civil-rights-police-accountability", scope: "national" },
  { prompt: "Housing discrimination complaints HUD enforcement actions landlords banks 2026", category: "civil-rights-police-accountability", scope: "local" },
  { prompt: "Racial profiling traffic stop data transparency legislation body camera mandates 2026", category: "civil-rights-police-accountability", scope: "national" },
  { prompt: "Civil rights attorney general interventions hate crime prosecutions 2026", category: "civil-rights-police-accountability", scope: "national" },
  { prompt: "School discipline racial equity federal investigations Black students 2026", category: "civil-rights-police-accountability", scope: "local" },
  { prompt: "International racial justice movements reparations commissions progress 2026", category: "civil-rights-police-accountability", scope: "global" },
  { prompt: "Qualified immunity reform legislation police officer accountability state laws 2026", category: "civil-rights-police-accountability", scope: "national" },
];

/** Number of prompts to run per daily cycle. 30 prompts across all 8
 * categories ensures 20+ stories publish every day even if a few fail. */
export const DAILY_BATCH_SIZE = 30;

/** Deterministically pick the next batch for a given day index. */
export function pickDailyBatch(dayIndex: number, count: number = DAILY_BATCH_SIZE): SeedPrompt[] {
  const start = (dayIndex * count) % DAILY_PROMPTS.length;
  const batch: SeedPrompt[] = [];
  for (let i = 0; i < count; i++) {
    batch.push(DAILY_PROMPTS[(start + i) % DAILY_PROMPTS.length]);
  }
  return batch;
}

/** Whole days since the Unix epoch — stable per calendar day. */
export function dayIndexAt(ms: number = Date.now()): number {
  return Math.floor(ms / 86_400_000);
}
