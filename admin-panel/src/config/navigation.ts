/**
 * The sidebar, as data.
 *
 * One list drives three things that must not drift apart: what the sidebar
 * renders, which route each entry points at, and which permission section gates
 * it. Describing them together is what stops a new screen from shipping visible
 * to a role that cannot open it.
 */

import type { IconName } from "@/components/ui/Icon";
import type { NavSection } from "@/types/rbac";

export interface NavChild {
  label: string;
  to: string;
  /**
   * Hide this child from a role listed here, even though the parent section is
   * permitted. Used for "My Assigned Cases", which is meaningless for a Super
   * Admin because nothing is assigned to them.
   */
  hideForRoles?: readonly string[];
}

export interface NavItem {
  /** Permission section this entry belongs to. */
  section: NavSection;
  label: string;
  icon: IconName;
  to: string;
  children?: readonly NavChild[];
}

export const NAVIGATION: readonly NavItem[] = [
  {
    section: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    to: "/dashboard",
  },
  {
    section: "incidents",
    label: "Incidents",
    icon: "incidents",
    to: "/incidents",
    children: [
      { label: "All Incidents", to: "/incidents" },
      { label: "My Assigned Cases", to: "/incidents/assigned", hideForRoles: ["superadmin"] },
    ],
  },
  {
    section: "moderation",
    label: "Content Moderation",
    icon: "moderation",
    to: "/moderation",
    children: [{ label: "Keyword Rules", to: "/moderation/keywords" }],
  },
  {
    section: "resources",
    label: "Resources",
    icon: "resources",
    to: "/resources",
  },
  {
    section: "news",
    label: "News",
    icon: "news",
    to: "/news",
    children: [
      { label: "News Categories", to: "/news/categories" },
      { label: "Tags Management", to: "/news/tags" },
      { label: "Daily Briefing", to: "/news/daily-briefing" },
    ],
  },
  {
    section: "notifications",
    label: "Notifications & Announcements",
    icon: "notifications",
    to: "/notifications",
  },
  {
    section: "content",
    label: "Content",
    icon: "content",
    to: "/content/articles",
    children: [
      { label: "Rights & Guidance", to: "/content/articles" },
      { label: "FAQs", to: "/content/faqs" },
      { label: "Legal Content", to: "/content/legal" },
    ],
  },
  {
    section: "users",
    label: "Users",
    icon: "users",
    to: "/users",
  },
  {
    section: "contact",
    label: "Contact Us",
    icon: "message",
    to: "/contact-inquiries",
  },
  {
    section: "adminRoles",
    label: "Admin & Roles",
    icon: "adminRoles",
    to: "/admin-roles",
  },
  {
    section: "settings",
    label: "Settings",
    icon: "settings",
    to: "/settings",
  },
] as const;

export default NAVIGATION;
