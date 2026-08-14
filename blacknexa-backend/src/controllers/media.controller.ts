/**
 * Media controller — serves AI-generated article images and TTS audio.
 *
 * `GET /api/v1/news/audio/:articleId` **did not exist in the Worker's router**,
 * even though the Durable Object implemented the handler and rewrote every
 * article's `audioUrl` to point at it. The app checks for exactly this path
 * (`app/news/[id].tsx:253`), received a 404, and silently fell back to device TTS.
 * Registering the route is a server-only fix — see `docs/MIGRATION_PLAN.md` §6.1.
 *
 * Both endpoints return raw bytes with `immutable` caching, because a given
 * article's media never changes: the id is part of the URL, and regenerating
 * produces a new row for the same id only when an operator explicitly backfills.
 */

import type { Request, Response } from "express";
import newsService from "@/services/news.service";
import { validatedParams } from "@/middlewares/validate.middleware";

/** One day, matching the Worker's `max-age=86400, immutable`. */
const MEDIA_CACHE_CONTROL = "public, max-age=86400, immutable";

class MediaController {
  /** `GET /api/v1/news/image/:articleId` → binary image */
  async image(req: Request, res: Response): Promise<void> {
    const { articleId } = validatedParams<{ articleId: string }>(req);
    const media = await newsService.getImage(decodeURIComponent(articleId));

    if (!media) {
      // Plain-text 404 with no envelope, matching the original — an <img> tag has
      // no use for a JSON error body.
      res.status(404).type("text/plain").send("image not found");
      return;
    }

    res.setHeader("Content-Type", media.mediaType);
    res.setHeader("Cache-Control", MEDIA_CACHE_CONTROL);
    // Images are embedded cross-origin by the apps and by social crawlers.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Length", String(media.bytes.length));
    res.status(200).end(media.bytes);
  }

  /** `GET /api/v1/news/audio/:articleId` → binary audio */
  async audio(req: Request, res: Response): Promise<void> {
    const { articleId } = validatedParams<{ articleId: string }>(req);
    const media = await newsService.getAudio(decodeURIComponent(articleId));

    if (!media) {
      res.status(404).type("text/plain").send("audio not found");
      return;
    }

    res.setHeader("Content-Type", media.mediaType);
    res.setHeader("Cache-Control", MEDIA_CACHE_CONTROL);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Length", String(media.bytes.length));
    // Lets the mobile audio player seek without re-downloading.
    res.setHeader("Accept-Ranges", "bytes");
    res.status(200).end(media.bytes);
  }
}

export const mediaController = new MediaController();
export default mediaController;
