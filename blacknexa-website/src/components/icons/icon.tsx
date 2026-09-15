export type IconName =
  | "faith"
  | "truth"
  | "integrity"
  | "wealth"
  | "tech"
  | "civic"
  | "geo"
  | "feed"
  | "news"
  | "directory"
  | "route"
  | "shield"
  | "share"
  | "users"
  | "rise"
  | "lock"
  | "trademark"
  | "eye"
  | "vault"
  | "dispatch";

const paths: Record<IconName, string[]> = {
  faith: ["M12 3.2v17.6", "M7 8.4h10"],
  truth: ["M4.2 12.4 9.4 17.6 20 6.6"],
  integrity: ["M12 3 19.4 5.6v6.2c0 4.6-3.1 7.9-7.4 9.2-4.3-1.3-7.4-4.6-7.4-9.2V5.6Z"],
  wealth: ["M4 19V9.4", "M9.6 19V5", "M15.2 19v-6.4", "M20.8 19V8"],
  tech: ["M9.4 3.4h5.2v3.2H9.4z", "M6.2 10.4h11.6v10.2H6.2z", "M12 6.6v3.8", "M9.6 14.6h4.8"],
  civic: ["M3.6 9.6 12 4l8.4 5.6", "M5.6 9.6v10.8h12.8V9.6", "M9.8 20.4v-6.2h4.4v6.2"],
  geo: [
    "M12 21.6s7.4-6.6 7.4-12.1a7.4 7.4 0 0 0-14.8 0c0 5.5 7.4 12.1 7.4 12.1Z",
    "M12 12.2v-3.6",
    "M10.2 10.4h3.6",
  ],
  feed: ["M4.4 5.6h15.2v10.2H12l-4.2 3.4v-3.4H4.4z", "M8 9.4h8", "M8 12.4h5"],
  news: ["M4.4 5.4h11.2v13.2H4.4z", "M15.6 9h4v7.4a2.2 2.2 0 0 1-4.4 0", "M7 8.6h6M7 11.6h6M7 14.6h4"],
  directory: ["M4.6 4.6h14.8v14.8H4.6z", "M8.2 8.4h7.6M8.2 12h7.6M8.2 15.6h4.4"],
  route: ["M6 4.4v9.2a4 4 0 0 0 4 4h8", "M15 14.6l3.4 3-3.4 3", "M6 4.4 3.4 7.4M6 4.4l2.6 3"],
  shield: [
    "M12 3 19.4 5.6v6.2c0 4.6-3.1 7.9-7.4 9.2-4.3-1.3-7.4-4.6-7.4-9.2V5.6Z",
    "M9.4 12.2 11.4 14.4l3.6-4.4",
  ],
  share: [
    "M17.4 8.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
    "M6.6 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
    "M17.4 21a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
    "M9 10.4l6-2.6M9 13.6l6 2.6",
  ],
  users: [
    "M9.2 11.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z",
    "M2.8 19.8c.7-3.6 3.4-5.4 6.4-5.4s5.7 1.8 6.4 5.4",
    "M16.4 6.2a3 3 0 0 1 0 5.6",
    "M18 14.8c2 .7 3 2.4 3.2 4.4",
  ],
  rise: ["M3.6 18.4 9 12.6l3.6 3 7.2-8", "M15.4 7.6h4.4v4.4"],
  lock: ["M4.6 10.2h14.8v9.4H4.6z", "M8.2 10.2V7.6a3.8 3.8 0 0 1 7.6 0v2.6", "M12 13.4v2.8"],
  trademark: [
    "M12 3.2 20.2 6v6.4c0 4.8-3.4 8.2-8.2 9.6-4.8-1.4-8.2-4.8-8.2-9.6V6Z",
    "M9 9.6h6",
    "M12 9.6v6.2",
  ],
  eye: [
    "M1.8 12S5.6 5.4 12 5.4 22.2 12 22.2 12 18.4 18.6 12 18.6 1.8 12 1.8 12Z",
    "M12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
  ],
  vault: ["M4.4 6.6h15.2v12.8H4.4z", "M12 10.2v5.6", "M9.6 13h4.8", "M8 6.6V5a4 4 0 0 1 8 0v1.6"],
  dispatch: ["M3.4 11.6 20.6 4.2 14 21l-2.8-7.4L3.4 11.6Z", "M11.2 13.6 20.6 4.2"],
};

export function Icon({
  name,
  size = 24,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name].map((d, i) => (
        <path d={d} key={i} />
      ))}
    </svg>
  );
}
