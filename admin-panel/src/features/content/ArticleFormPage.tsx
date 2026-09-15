/**
 * Create or edit a Rights & Guidance article.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { useToast } from "@/app/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { Card, PageHeader } from "@/components/ui/Page";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { educationalArticles } from "@/mocks/educationalArticles";

const STATUSES = [
  { value: "Draft", label: "Draft — not visible to members" },
  { value: "Published", label: "Published — live in the app" },
];

const schema = z.object({
  title: z.string().trim().min(6, "Give the article a title.").max(200),
  category: z.string().trim().min(1, "Choose a category."),
  content: z
    .string()
    .trim()
    .min(80, "The article is too short to be useful. Aim for a few paragraphs."),
  status: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function ArticleFormPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const existing = useMemo(
    () => educationalArticles.find((a) => a.id === articleId),
    [articleId],
  );
  const editing = Boolean(articleId);

  const categories = useMemo(
    () =>
      [...new Set(educationalArticles.map((a) => a.category))]
        .sort()
        .map((c) => ({ value: c, label: c })),
    [],
  );

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: existing?.title ?? "",
      category: existing?.category ?? (categories[0]?.value ?? "Know Your Rights"),
      content: existing?.content ?? "",
      status: existing?.status ?? "Draft",
    },
  });

  useEffect(() => {
    document.title = `${editing ? "Edit" : "New"} article · ${env.appName} Admin`;
  }, [editing]);

  const onSubmit = handleSubmit((values) => {
    toast.success(
      editing ? "Article updated" : "Article created",
      `${values.title} saved as ${values.status.toLowerCase()}.`,
    );
    navigate("/content/articles");
  });

  return (
    <Card className="cm-page">
      <PageHeader
        title={editing ? "Edit Article" : "New Article"}
        description="Guidance shown to members in the app. Write plainly — people read these under stress."
      />

      <FixtureNotice module="Article editing" />

      <form onSubmit={onSubmit} noValidate>
        <div className="cm-section-box">
          <div className="cm-section-head">
            <span className="cm-section-num">1</span>
            Article
          </div>

          <TextField
            label="Title"
            placeholder="e.g. What to do if you are stopped by police"
            error={errors.title?.message}
            {...register("title")}
          />

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

          <label htmlFor="article-content">Content</label>
          <textarea
            id="article-content"
            rows={16}
            placeholder="Leave a blank line between paragraphs."
            {...(errors.content ? { "aria-invalid": true } : {})}
            {...register("content")}
          />
          {errors.content ? (
            <div className="field-error-msg" style={{ display: "block" }}>
              {errors.content.message}
            </div>
          ) : null}
        </div>

        <div className="cm-section-box">
          <div className="cm-section-head">
            <span className="cm-section-num">2</span>
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
        </div>

        <div className="form-actions">
          <Button variant="outline" onClick={() => navigate("/content/articles")}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            {editing ? "Save Changes" : "Create Article"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default ArticleFormPage;
