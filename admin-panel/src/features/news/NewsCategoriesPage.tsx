/**
 * News Categories.
 *
 * Seeded from the categories the stories actually use, so the usage counts on
 * screen are real rather than invented.
 */

import { useMemo } from "react";

import { TaxonomyPage, categorySeed } from "@/features/news/TaxonomyPage";

export function NewsCategoriesPage() {
  const seed = useMemo(() => categorySeed(), []);

  return (
    <TaxonomyPage
      noun="category"
      plural="categories"
      title="News Categories"
      description="Categories stories are filed under. These drive the feed's filters and the category pages."
      seed={seed}
    />
  );
}

export default NewsCategoriesPage;
