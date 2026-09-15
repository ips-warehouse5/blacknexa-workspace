export type NavLink = {
  label: string;
  href: string;
};

export const mainNav: NavLink[] = [
  { label: "About", href: "/#about" },
  { label: "Features", href: "/#features" },
  { label: "News", href: "/#news" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contact", href: "/contact" },
];

export const footerProductLinks: NavLink[] = [
  { label: "Features", href: "/#features" },
  { label: "News", href: "/#news" },
  { label: "Waitlist", href: "/#waitlist" },
  { label: "FAQ", href: "/#faq" },
];

export const footerCompanyLinks: NavLink[] = [
  { label: "Mission", href: "/#mission" },
  { label: "Contact", href: "/contact" },
  { label: "Partnerships", href: "/contact" },
  { label: "Press", href: "/contact" },
];

export const footerLegalLinks: NavLink[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Disclaimers", href: "/disclaimer" },
];
