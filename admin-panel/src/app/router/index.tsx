/**
 * The route table.
 *
 * Screens are lazy-loaded so the first paint after sign-in ships the shell and
 * the dashboard rather than all twenty screens. The two modules that are wired
 * to the API — auth and admin/roles — are imported eagerly: they are on the
 * critical path, and a loading flash on the login form is the worst place to
 * save a few kilobytes.
 *
 * Every section is wrapped in `RequireSection`, which mirrors the sidebar's
 * filtering. The sidebar decides what to show; this decides what a pasted URL
 * does, and the two read from the same matrix.
 */

import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { RedirectIfAuthenticated, RequireAuth, RequireSection } from "@/app/router/guards";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminRolesPage } from "@/features/admin-roles/AdminRolesPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { NotFoundPage } from "@/features/misc/NotFoundPage";

const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const IncidentsPage = lazy(() => import("@/features/incidents/IncidentsPage"));
const IncidentDetailPage = lazy(() => import("@/features/incidents/IncidentDetailPage"));
const AssignedCasesPage = lazy(() => import("@/features/incidents/AssignedCasesPage"));
const ModerationQueuePage = lazy(() => import("@/features/moderation/ModerationQueuePage"));
const ModerationDetailPage = lazy(() => import("@/features/moderation/ModerationDetailPage"));
const KeywordRulesPage = lazy(() => import("@/features/moderation/KeywordRulesPage"));
const UsersPage = lazy(() => import("@/features/users/UsersPage"));
const UserDetailPage = lazy(() => import("@/features/users/UserDetailPage"));
const ResourcesPage = lazy(() => import("@/features/resources/ResourcesPage"));
const ResourceDetailPage = lazy(() => import("@/features/resources/ResourceDetailPage"));
const ResourceFormPage = lazy(() => import("@/features/resources/ResourceFormPage"));
const NewsPage = lazy(() => import("@/features/news/NewsPage"));
const NewsDetailPage = lazy(() => import("@/features/news/NewsDetailPage"));
const NewsFormPage = lazy(() => import("@/features/news/NewsFormPage"));
const NewsCategoriesPage = lazy(() => import("@/features/news/NewsCategoriesPage"));
const NewsTagsPage = lazy(() => import("@/features/news/NewsTagsPage"));
const DailyBriefingPage = lazy(() => import("@/features/news/DailyBriefingPage"));
const NotificationsPage = lazy(() => import("@/features/notifications/NotificationsPage"));
const ArticlesPage = lazy(() => import("@/features/content/ArticlesPage"));
const ArticleFormPage = lazy(() => import("@/features/content/ArticleFormPage"));
const ArticleDetailPage = lazy(() => import("@/features/content/ArticleDetailPage"));
const FaqsPage = lazy(() => import("@/features/content/FaqsPage"));
const LegalContentPage = lazy(() => import("@/features/content/LegalContentPage"));
const LegalEditorPage = lazy(() => import("@/features/content/LegalEditorPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [{ path: "/login", element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },

          {
            element: <RequireSection section="dashboard" />,
            children: [{ path: "dashboard", element: <DashboardPage /> }],
          },

          {
            element: <RequireSection section="incidents" />,
            children: [
              { path: "incidents", element: <IncidentsPage /> },
              { path: "incidents/assigned", element: <AssignedCasesPage /> },
              { path: "incidents/:incidentId", element: <IncidentDetailPage /> },
            ],
          },

          {
            element: <RequireSection section="moderation" />,
            children: [
              { path: "moderation", element: <ModerationQueuePage /> },
              { path: "moderation/keywords", element: <KeywordRulesPage /> },
              { path: "moderation/:postId", element: <ModerationDetailPage /> },
            ],
          },

          {
            element: <RequireSection section="resources" />,
            children: [
              { path: "resources", element: <ResourcesPage /> },
              { path: "resources/new", element: <ResourceFormPage /> },
              { path: "resources/:resourceId", element: <ResourceDetailPage /> },
              { path: "resources/:resourceId/edit", element: <ResourceFormPage /> },
            ],
          },

          {
            element: <RequireSection section="news" />,
            children: [
              { path: "news", element: <NewsPage /> },
              { path: "news/new", element: <NewsFormPage /> },
              { path: "news/categories", element: <NewsCategoriesPage /> },
              { path: "news/tags", element: <NewsTagsPage /> },
              { path: "news/daily-briefing", element: <DailyBriefingPage /> },
              { path: "news/:storyId", element: <NewsDetailPage /> },
              { path: "news/:storyId/edit", element: <NewsFormPage /> },
            ],
          },

          {
            element: <RequireSection section="notifications" />,
            children: [{ path: "notifications", element: <NotificationsPage /> }],
          },

          {
            element: <RequireSection section="content" />,
            children: [
              { path: "content/articles", element: <ArticlesPage /> },
              { path: "content/articles/new", element: <ArticleFormPage /> },
              { path: "content/articles/:articleId", element: <ArticleDetailPage /> },
              { path: "content/articles/:articleId/edit", element: <ArticleFormPage /> },
              { path: "content/faqs", element: <FaqsPage /> },
              { path: "content/legal", element: <LegalContentPage /> },
              { path: "content/legal/:documentType", element: <LegalEditorPage /> },
            ],
          },

          {
            element: <RequireSection section="users" />,
            children: [
              { path: "users", element: <UsersPage /> },
              { path: "users/:userId", element: <UserDetailPage /> },
            ],
          },

          {
            element: <RequireSection section="adminRoles" />,
            children: [{ path: "admin-roles", element: <AdminRolesPage /> }],
          },

          {
            element: <RequireSection section="settings" />,
            children: [{ path: "settings", element: <SettingsPage /> }],
          },

          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export default router;
