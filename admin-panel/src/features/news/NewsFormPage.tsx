/**
 * Create or edit a news story.
 *
 * Sources are part of the form rather than an afterthought, because a story
 * that cannot say where it came from should not be publishable. The status
 * field enforces that: "Published" requires at least one source.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { useToast } from "@/app/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Switch, TextField } from "@/components/ui/Fields";
import { Card, PageHeader } from "@/components/ui/Page";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { newsStories } from "@/mocks/newsStories";
import type { NewsSource } from "@/mocks/types";

const SCOPES = [
  { value: "Global", label: "Global" },
  { value: "National", label: "National" },
  { value: "Local", label: "Local" },
];

const STATUSES = [
  { value: "Draft", label: "Draft — not visible" },
  { value: "Scheduled", label: "Scheduled — publishes later" },
  { value: "Published", label: "Published — live in the feed" },
  { value: "Archived", label: "Archived — withdrawn" },
];

const CREDIBILITY = [
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const schema = z.object({
  title: z.string().trim().min(8, "Give the story a headline.").max(200),
  summary: z.string().trim().min(20, "Write a short summary.").max(600),
  body: z.string().trim().min(80, "The story body is too short to publish."),
  category: z.string().trim().min(1, "Choose a category."),
  scope: z.string().min(1),
  location: z.string().trim().min(2, "Say where this applies."),
  status: z.string().min(1),
  verified: z.boolean(),
  seoIndexed: z.boolean(),
  dailyBriefing: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function NewsFormPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const existing = useMemo(() => newsStories.find((s) => s.id === storyId), [storyId]);
  const editing = Boolean(storyId);

  const [sources, setSources] = useState<NewsSource[]>(existing?.sources ?? []);
  const [draft, setDraft] = useState<NewsSource>({ name: "", url: "", credibility: "High" });
  const [sourceError, setSourceError] = useState<string | null>(null);

  const categories = useMemo(
    () =>
      [...new Set(newsStories.map((s) => s.category))]
        .sort()
        .map((c) => ({ value: c, label: c })),
    [],
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: existing?.title ?? "",
      summary: existing?.summary ?? "",
      body: existing?.body ?? "",
      category: existing?.category ?? (categories[0]?.value ?? "Civil Rights"),
      scope: existing?.scope ?? "National",
      location: existing?.location ?? "",
      status: existing?.status ?? "Draft",
      verified: existing?.verified ?? false,
      seoIndexed: existing?.seoIndexed ?? true,
      dailyBriefing: existing?.dailyBriefing ?? false,
    },
  });

  const status = watch("status");

  useEffect(() => {
    document.title = `${editing ? "Edit" : "New"} story · ${env.appName} Admin`;
  }, [editing]);

  const addSource = () => {
    const name = draft.name.trim();
    const url = draft.url.trim();
    if (!name || !url) {
      setSourceError("A source needs both a name and a URL.");
      return;
    }
    try {
      // Parsing rather than regex: the URL constructor is the actual authority
      // on whether a browser can follow this link.
      new URL(url);
    } catch {
      setSourceError("That does not look like a valid URL.");
      return;
    }
    setSources((current) => [...current, { name, url, credibility: draft.credibility }]);
    setDraft({ name: "", url: "", credibility: "High" });
    setSourceError(null);
  };

  const onSubmit = handleSubmit((values) => {
    // The one cross-field rule: publishing needs attribution.
    if (values.status === "Published" && sources.length === 0) {
      setError("status", {
        message: "Add at least one source before publishing this story.",
      });
      return;
    }

    toast.success(
      editing ? "Story updated" : "Story created",
      `${values.title} saved as ${values.status.toLowerCase()}.`,
    );
    navigate("/news");
  });

  return (
    <Card className="cm-page">
      <PageHeader
        title={editing ? "Edit Story" : "New Story"}
        description="Stories published to the member feed. Cite every source — publishing requires at least one."
      />

      <FixtureNotice module="Story editing" />

      <form onSubmit={onSubmit} noValidate>
        <div className="cm-section-box">
          <div className="cm-section-head">
            <span className="cm-section-num">1</span>
            Story
          </div>

          <TextField
            label="Headline"
            placeholder="e.g. New oversight board announced for borough policing"
            error={errors.title?.message}
            {...register("title")}
          />

          <label htmlFor="story-summary">Summary</label>
          <textarea
            id="story-summary"
            rows={3}
            placeholder="One or two sentences shown in the feed."
            {...(errors.summary ? { "aria-invalid": true } : {})}
            {...register("summary")}
          />
          {errors.summary ? (
            <div className="field-error-msg" style={{ display: "block" }}>
              {errors.summary.message}
            </div>
          ) : null}

          <label htmlFor="story-body" style={{ marginTop: 16 }}>
            Full story
          </label>
          <textarea
            id="story-body"
            rows={12}
            placeholder="The story in full. Leave a blank line between paragraphs."
            {...(errors.body ? { "aria-invalid": true } : {})}
            {...register("body")}
          />
          {errors.body ? (
            <div className="field-error-msg" style={{ display: "block" }}>
              {errors.body.message}
            </div>
          ) : null}
        </div>

        <div className="cm-section-box">
          <div className="cm-section-head">
            <span className="cm-section-num">2</span>
            Placement
          </div>

          <div className="form-row-2">
            <div className="login-field">
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select
                    label="Category"
                    showLabel
                    value={field.value}
                    options={categories}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="login-field">
              <Controller
                name="scope"
                control={control}
                render={({ field }) => (
                  <Select
                    label="Scope"
                    showLabel
                    value={field.value}
                    options={SCOPES}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>

          <TextField
            label="Location"
            placeholder="e.g. Hackney, London"
            error={errors.location?.message}
            {...register("location")}
          />
        </div>

        <div className="cm-section-box">
          <div className="cm-section-head">
            <span className="cm-section-num">3</span>
            Sources ({sources.length})
          </div>

          {sources.length > 0 ? (
            <table className="mini">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "30%" }}>
                    Source
                  </th>
                  <th scope="col" style={{ width: "46%" }}>
                    URL
                  </th>
                  <th scope="col" style={{ width: "14%" }}>
                    Credibility
                  </th>
                  <th scope="col" style={{ width: "10%" }} />
                </tr>
              </thead>
              <tbody>
                {sources.map((source, index) => (
                  <tr key={`${source.url}-${index}`}>
                    <td>
                      <strong>{source.name}</strong>
                    </td>
                    <td className="cell-truncate">{source.url}</td>
                    <td>
                      <span className="badge approved">{source.credibility}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="action-icon-btn delete-icon-btn"
                        aria-label={`Remove ${source.name}`}
                        onClick={() => setSources((c) => c.filter((_, i) => i !== index))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No sources cited yet.</div>
          )}

          <div className="source-add-row">
            <input
              type="text"
              value={draft.name}
              placeholder="Source name"
              aria-label="Source name"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <input
              type="url"
              value={draft.url}
              placeholder="https://…"
              aria-label="Source URL"
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
            />
            <Select
              label="Credibility"
              value={draft.credibility}
              options={CREDIBILITY}
              onChange={(value) => setDraft((d) => ({ ...d, credibility: value }))}
              minWidth={130}
            />
            <Button variant="outline" onClick={addSource}>
              Add
            </Button>
          </div>

          {sourceError ? (
            <div className="field-error-msg" style={{ display: "block" }}>
              {sourceError}
            </div>
          ) : null}
        </div>

        <div className="cm-section-box">
          <div className="cm-section-head">
            <span className="cm-section-num">4</span>
            Publication
          </div>

          <div className="login-field">
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select
                  label="Status"
                  showLabel
                  value={field.value}
                  options={STATUSES}
                  onChange={field.onChange}
                />
              )}
            />
            {errors.status ? (
              <div className="field-error-msg" style={{ display: "block" }}>
                {errors.status.message}
              </div>
            ) : null}
          </div>

          {status === "Published" && sources.length === 0 ? (
            <div className="login-warn-alert" style={{ display: "block" }}>
              This story has no sources. Add at least one before publishing.
            </div>
          ) : null}

          <Controller
            name="verified"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label="Verified"
                hint="Marks the story as fact-checked against its sources."
              />
            )}
          />

          <Controller
            name="seoIndexed"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label="Allow search indexing"
                hint="Turn off for stories that should not be discoverable outside the app."
              />
            )}
          />

          <Controller
            name="dailyBriefing"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label="Include in the daily briefing"
                hint="Goes out to every member in the next briefing."
              />
            )}
          />
        </div>

        <div className="form-actions">
          <Button variant="outline" onClick={() => navigate("/news")}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            {editing ? "Save Changes" : "Create Story"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default NewsFormPage;
