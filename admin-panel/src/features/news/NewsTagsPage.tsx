/**
 * Tags Management.
 *
 * Tags are cross-cutting where categories are exclusive: a story has one
 * category and any number of tags. The screen is otherwise identical, which is
 * why both use `TaxonomyPage`.
 */

import { TaxonomyPage, type TaxonomyTerm } from "@/features/news/TaxonomyPage";

/** Prototype tag set, with the usage counts the design shows. */
const TAGS: TaxonomyTerm[] = [
  { id: "civil-rights", name: "Civil Rights", slug: "civil-rights", usage: 12, active: true },
  { id: "policing", name: "Policing", slug: "policing", usage: 9, active: true },
  { id: "housing", name: "Housing", slug: "housing", usage: 7, active: true },
  { id: "legal-aid", name: "Legal Aid", slug: "legal-aid", usage: 6, active: true },
  { id: "community", name: "Community", slug: "community", usage: 5, active: true },
  { id: "education", name: "Education", slug: "education", usage: 4, active: true },
  { id: "health", name: "Health", slug: "health", usage: 3, active: true },
  { id: "workplace", name: "Workplace", slug: "workplace", usage: 3, active: true },
  { id: "policy", name: "Policy", slug: "policy", usage: 2, active: true },
  { id: "archive", name: "Archive", slug: "archive", usage: 0, active: false },
];

export function NewsTagsPage() {
  return (
    <TaxonomyPage
      noun="tag"
      plural="tags"
      title="Tags Management"
      description="Cross-cutting labels applied to stories. A story can carry several tags but only one category."
      seed={TAGS}
    />
  );
}

export default NewsTagsPage;
