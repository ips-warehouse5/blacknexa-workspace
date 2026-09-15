/**
 * The console sidebar.
 *
 * Renders `config/navigation` filtered by what the signed-in role may open.
 * Entries a role cannot use are removed rather than disabled: a whole section
 * that is not theirs is not a locked door worth showing, and a sidebar of greyed
 * entries makes a limited account feel broken rather than scoped.
 *
 * The footer carries the theme controls and the account block, matching the
 * prototype.
 */

import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { ACCENT_SWATCHES, useTheme } from "@/app/providers/ThemeProvider";
import { Icon } from "@/components/ui/Icon";
import env from "@/config/env";
import { NAVIGATION, type NavItem } from "@/config/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { ROLE_LABELS } from "@/types/rbac";

/** Two-letter monogram from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
  }
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

/** Whether a path is inside an item's subtree, for auto-expanding its submenu. */
function isWithin(pathname: string, item: NavItem): boolean {
  if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return true;
  return (item.children ?? []).some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`));
}

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { accent, mode, setAccent, setMode } = useTheme();

  const admin = useAuthStore((s) => s.admin);
  const canNavigate = useAuthStore((s) => s.canNavigate);
  const logout = useAuthStore((s) => s.logout);

  const visible = NAVIGATION.filter((item) => canNavigate(item.section));

  /** Which parents are expanded. Keyed by section. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /**
   * Open the section containing the current route.
   *
   * Additive rather than replacing: a section the operator opened by hand stays
   * open when they navigate elsewhere, which is how a sidebar is expected to
   * behave.
   */
  useEffect(() => {
    const owner = visible.find((item) => item.children && isWithin(pathname, item));
    if (!owner) return;
    setExpanded((current) =>
      current.has(owner.section) ? current : new Set(current).add(owner.section),
    );
    // `visible` is derived and would change identity every render; the route is
    // the only thing that should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggle = (section: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(section)) next.add(section);
      return next;
    });

  return (
    <aside className="side">
      <div className="brand-wrap">
        <div className="brand-icon" aria-hidden="true">
          B
        </div>
        <div className="brand-text">
          <div className="brand-title">
            {env.appName}
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--muted)",
                verticalAlign: "super",
                letterSpacing: "0.5px",
              }}
            >
              TM
            </span>
          </div>
          <div className="brand-sub">Admin Panel</div>
        </div>
      </div>

      <nav className="side-menu" aria-label="Main">
        {visible.map((item) => {
          const children = (item.children ?? []).filter(
            (child) => !child.hideForRoles?.includes(admin?.role ?? ""),
          );
          const hasChildren = children.length > 0;
          const open = expanded.has(item.section);
          const active = isWithin(pathname, item);

          if (!hasChildren) {
            return (
              <NavLink
                key={item.section}
                to={item.to}
                className={({ isActive }) => `nav${isActive ? " active" : ""}`}
              >
                <span className="nav-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            );
          }

          return (
            <div key={item.section}>
              <button
                type="button"
                className={`nav${active ? " active" : ""}`}
                aria-expanded={open}
                onClick={() => {
                  // Clicking a parent both opens its submenu and goes to its
                  // landing page, which is what the prototype does.
                  if (!open) setExpanded((c) => new Set(c).add(item.section));
                  else toggle(item.section);
                  navigate(item.to);
                }}
              >
                <span className="nav-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="nav-label">{item.label}</span>
                <span className="nav-arrow" aria-hidden="true">
                  {open ? "▾" : "▸"}
                </span>
              </button>

              {open ? (
                <div className="sub-menu">
                  {children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end
                      className={({ isActive }) => `sub-nav${isActive ? " active" : ""}`}
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="side-footer">
        <div>
          <div className="accent-title" id="accent-heading">
            Accent
          </div>
          <div className="accent-palette" role="radiogroup" aria-labelledby="accent-heading">
            {ACCENT_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                role="radio"
                aria-checked={accent === swatch.value}
                aria-label={swatch.label}
                title={swatch.label}
                className={`palette-circle${accent === swatch.value ? " active" : ""}`}
                style={{ background: swatch.swatch }}
                onClick={() => setAccent(swatch.value)}
              />
            ))}
          </div>
        </div>

        <div className="theme-switch" role="radiogroup" aria-label="Appearance">
          {(["light", "dark"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={mode === option}
              className={`theme-opt${mode === option ? " active" : ""}`}
              onClick={() => setMode(option)}
            >
              {option === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>

        <div className="user-account">
          <div className="user-avatar" aria-hidden="true">
            {admin ? initials(admin.name) : "–"}
          </div>
          <div className="user-info">
            <div className="user-name">{admin?.name ?? "Not signed in"}</div>
            <div className="user-role">{admin ? ROLE_LABELS[admin.role] : ""}</div>
          </div>
          <button
            type="button"
            className="logout-btn"
            title="Sign out of the admin panel"
            onClick={() => {
              void logout();
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
