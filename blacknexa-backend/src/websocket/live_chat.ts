/**
 * Live-chat broadcast hub — replaces Cloudflare's `WebSocketPair`.
 *
 * Attached to the same HTTP server so the client URL is unchanged:
 * `LiveChatSheet.tsx` derives it by swapping the scheme on the API base
 * (`http` → `ws`) and appending `/api/v1/blacknexa/live-chat`.
 *
 * Behaviour ported exactly from `platform-store.ts`:
 *   • Every inbound message is moderated **before** it is broadcast. A rejected
 *     message is not dropped silently — the sender receives a private
 *     `moderation-rejected` notice, which is what the sheet renders as a banner.
 *   • Approved messages are relayed verbatim to every *other* socket; the sender
 *     already rendered their own message optimistically.
 *
 * Additions over the original, both necessary in a long-lived Node process rather
 * than a per-request isolate:
 *   • A heartbeat ping that reaps half-open sockets, which otherwise accumulate
 *     forever behind NAT and mobile network transitions.
 *   • A per-socket message-rate cap and a payload size limit.
 */

import type { Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import logger from "@/utils/logger.util";
import moderationService from "@/services/moderation.service";

const LIVE_CHAT_PATH = "/api/v1/blacknexa/live-chat";

/** Half-open sockets are reaped if they miss a heartbeat round. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Anything larger is not a chat line. */
const MAX_MESSAGE_BYTES = 8 * 1024;

/** Per-socket flood guard. */
const RATE_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 20;

/** Per-connection state we track alongside the socket. */
interface SocketState {
  isAlive: boolean;
  windowStart: number;
  messageCount: number;
}

const state = new WeakMap<WebSocket, SocketState>();

let wss: WebSocketServer | null = null;
let heartbeat: NodeJS.Timeout | null = null;

/** True when the socket is within its rate budget; increments the counter. */
function withinRateLimit(socket: WebSocket): boolean {
  const s = state.get(socket);
  if (!s) return false;

  const now = Date.now();
  if (now - s.windowStart > RATE_WINDOW_MS) {
    s.windowStart = now;
    s.messageCount = 0;
  }
  s.messageCount++;
  return s.messageCount <= MAX_MESSAGES_PER_WINDOW;
}

/** Send JSON to one socket, ignoring a closed peer. */
function safeSend(socket: WebSocket, payload: unknown): void {
  try {
    socket.send(typeof payload === "string" ? payload : JSON.stringify(payload));
  } catch {
    // The socket is gone; the close handler will clean it up.
  }
}

/**
 * Attach the live-chat WebSocket server to an existing HTTP server.
 *
 * `noServer: true` plus a manual `upgrade` handler means only this exact path is
 * upgraded — any other upgrade attempt is refused rather than silently accepted.
 */
export function attachLiveChat(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== LIVE_CHAT_PATH) {
      // Not our endpoint — refuse cleanly instead of leaving the socket hanging.
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(request, socket, head, (ws) => {
      wss!.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket: WebSocket) => {
    state.set(socket, { isAlive: true, windowStart: Date.now(), messageCount: 0 });
    logger.info("[live-chat] client connected", { clients: wss?.clients.size ?? 0 });

    socket.on("pong", () => {
      const s = state.get(socket);
      if (s) s.isAlive = true;
    });

    socket.on("message", (raw) => {
      void handleMessage(socket, raw.toString());
    });

    socket.on("close", () => {
      state.delete(socket);
      logger.debug("[live-chat] client disconnected", { clients: wss?.clients.size ?? 0 });
    });

    socket.on("error", (err) => {
      logger.warn("[live-chat] socket error", { message: err.message });
      state.delete(socket);
    });
  });

  // Reap sockets that stopped responding — common on mobile networks.
  heartbeat = setInterval(() => {
    for (const socket of wss?.clients ?? []) {
      const s = state.get(socket);
      if (!s || !s.isAlive) {
        socket.terminate();
        state.delete(socket);
        continue;
      }
      s.isAlive = false;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  // Do not hold the event loop open on shutdown.
  heartbeat.unref();

  logger.info(`[live-chat] WebSocket hub listening on ${LIVE_CHAT_PATH}`);
  return wss;
}

/** Moderate an inbound line, then broadcast it if it passes. */
async function handleMessage(socket: WebSocket, data: string): Promise<void> {
  if (!withinRateLimit(socket)) {
    safeSend(socket, {
      type: "rate-limited",
      text: "You are sending messages too quickly. Please slow down.",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // The client sends JSON with a `text` field; a plain string is moderated as-is.
  let textToModerate = data;
  try {
    const parsed = JSON.parse(data) as { text?: string };
    textToModerate = parsed.text ?? data;
  } catch {
    // Plain text — use it directly.
  }

  // Synchronous filter: no I/O, so a chat line is not delayed by a database read.
  const moderation = moderationService.checkContent(textToModerate);

  if (!moderation.approved) {
    // Private rejection to the sender only. The message is never relayed.
    safeSend(socket, {
      type: "moderation-rejected",
      text: "Message blocked by faith-grounded community guidelines.",
      violationCategory: moderation.violationCategory,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  for (const peer of wss?.clients ?? []) {
    if (peer !== socket && peer.readyState === peer.OPEN) {
      safeSend(peer, data);
    }
  }
}

/** Close the hub during shutdown. */
export function closeLiveChat(): Promise<void> {
  return new Promise((resolve) => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (!wss) return resolve();
    for (const socket of wss.clients) socket.close(1001, "Server shutting down");
    wss.close(() => {
      wss = null;
      resolve();
    });
  });
}

/** Connected client count, for the stats surface. */
export function liveChatClientCount(): number {
  return wss?.clients.size ?? 0;
}
