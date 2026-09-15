/**
 * Add or edit a directory resource.
 *
 * One form for both, chosen by whether the route carries an id. Saving is not
 * wired to an endpoint yet, so it confirms and returns to the list — the shape
 * of the form is what this screen is for at this stage.
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
import { directoryResources } from "@/mocks/directoryResources";

const CATEGORIES = [
  { value: "legal", label: "Legal Aid" },
  { value: "mental_health", label: "Mental Health" },
  { value: "housing", label: "Housing" },
  { value: "community", label: "Community" },
  { value: "emergency", label: "Emergency" },
];

const REACHES = [
  { value: "National", label: "National" },
  { value: "Regional", label: "Regional" },
  { value: "Local", label: "Local" },
];

const STATUSES = [
  { value: "Published", label: "Published — visible to members" },
  { value: "Draft", label: "Draft — not yet visible" },
  { value: "Archived", label: "Archived — withdrawn" },
];

const schema = z.object({
  name: z.string().trim().min(2, "Enter the organisation's name.").max(160),
  category: z.string().min(1, "Choose a category."),
  reach: z.string().min(1, "Choose a reach."),
  regionsServed: z.string().trim().min(2, "Say which areas this covers."),
  contact: z.string().trim().min(3, "Enter a contact route — a URL, phone number, or address."),
  description: z
    .string()
    .trim()
    .min(20, "Describe what the organisation does, in at least a sentence.")
    .max(2000),
  status: z.string().min(1),
  verified: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function ResourceFormPage() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const existing = useMemo(
    () => directoryResources.find((r) => r.id === resourceId),
    [resourceId],
  );
  const editing = Boolean(resourceId);

  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: existing?.name ?? "",
      category: existing?.category ?? "legal",
      reach: existing?.reach ?? "National",
      regionsServed: existing?.regionsServed ?? "",
      contact: existing?.contact ?? "",
      description: existing?.description ?? "",
      status: existing?.status ?? "Draft",
      verified: existing?.verified ?? false,
    },
  });

  useEffect(() => {
    document.title = `${editing ? "Edit" : "New"} resource · ${env.appName} Admin`;
  }, [editing]);

  const onSubmit = handleSubmit((values) => {
    toast.success(
      editing ? "Resource updated" : "Resource created",
      `${values.name} has been saved as ${values.status.toLowerCase()}.`,
    );
    navigate("/resources");
  });

  const addTag = () => {
    const tag = tagDraft.trim();
    if (!tag || tags.includes(tag)) {
      setTagDraft("");
      return;
    }
    setTags((current) => [...current, tag]);
    setTagDraft("");
  };

  return (
    <Card className="cm-page">
      <PageHeader
        title={editing ? "Edit Resource" : "Add Resource"}
        description="Support organisations shown to members. Confirm the contact route works before publishing."
      />

      <FixtureNotice module="Resource editing" />

      <form onSubmit={onSubmit} noValidate className="resource-form">
        <div className="cm-section-box">
          <div className="cm-section-head">
            <span className="cm-section-num">1</span>
            Organisation
          </div>

          <TextField
            label="Organisation name"
            placeholder="e.g. NAACP Legal Defense and Educational Fund"
            error={errors.name?.message}
            {...register("name")}
          />

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
                    options={CATEGORIES}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="login-field">
              <Controller
                name="reach"
                control={control}
                render={({ field }) => (
                  <Select
                    label="Reach"
                    showLabel
                    value={field.value}
                    options={REACHES}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>

          <TextField
            label="Regions served"
            placeholder="e.g. United States (Nationwide)"
            hint="How members will read the coverage area."
            error={errors.regionsServed?.message}
            {...register("regionsServed")}
          />

          <TextField
            label="Contact / intake"
            placeholder="e.g. naacpldf.org or +1 800 555 0100"
            error={errors.contact?.message}
            {...register("contact")}
          />
        </div>

        <div className="cm-section-box">
          <div className="cm-section-head">
            <span className="cm-section-num">2</span>
            Description & tags
          </div>

          <label htmlFor="resource-description">Description</label>
          <textarea
            id="resource-description"
            rows={5}
            placeholder="What the organisation does, who it helps, and how to reach it."
            {...(errors.description ? { "aria-invalid": true } : {})}
            {...register("description")}
          />
          {errors.description ? (
            <div className="field-error-msg" style={{ display: "block" }}>
              {errors.description.message}
            </div>
          ) : null}

          <label htmlFor="resource-tag" style={{ marginTop: 16 }}>
            Tags
          </label>
          <div className="keyword-editor">
            {tags.map((tag) => (
              <span className="keyword-chip editable" key={tag}>
                {tag}
                <button
                  type="button"
                  className="delete-keyword"
                  aria-label={`Remove ${tag}`}
                  onClick={() => setTags((c) => c.filter((t) => t !== tag))}
                >
                  ×
                </button>
              </span>
            ))}
            {tags.length === 0 ? (
              <span style={{ color: "var(--muted)", fontSize: 12 }}>No tags yet.</span>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              id="resource-tag"
              type="text"
              value={tagDraft}
              placeholder="Add a tag and press Enter"
              style={{ flex: 1 }}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter adds a tag rather than submitting the whole form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Button variant="outline" onClick={addTag}>
              Add
            </Button>
          </div>
        </div>

        <div className="cm-section-box">
          <div className="cm-section-head">
            <span className="cm-section-num">3</span>
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
          </div>

          <Controller
            name="verified"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label="Verified organisation"
                hint="Only tick this once someone has confirmed the contact route works."
              />
            )}
          />
        </div>

        <div className="form-actions">
          <Button variant="outline" onClick={() => navigate("/resources")}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            {editing ? "Save Changes" : "Create Resource"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default ResourceFormPage;
