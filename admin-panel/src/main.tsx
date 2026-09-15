/**
 * Browser entry point.
 *
 * StrictMode is on. It double-invokes effects in development, which is exactly
 * the pressure that surfaces a missing cleanup or a request fired twice — both
 * worth finding here rather than in production.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/App";
import "@/styles/index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error('Missing #root element — check index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
