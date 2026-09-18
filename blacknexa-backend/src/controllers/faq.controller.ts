/**
 * FAQ controller — the public read and the console's editing surface.
 *
 * Both live here because they are one resource seen from two sides, and keeping
 * them together makes it obvious that the public methods never touch anything
 * the editorial ones can write except through `faqService`.
 */

import type { Request, Response } from "express";

import faqService from "@/services/faq.service";
import { buildPagination, responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from "@/middlewares/validate.middleware";
import type {
  CreateFaqDto,
  FaqListParams,
  FaqSurface,
  UpdateFaqDto,
} from "@/types/faq.interface";

class FaqController {
  // ── Public ────────────────────────────────────────────────────────────────

  /**
   * `GET /api/v1/help/faq?surface=app|website`
   *
   * Unauthenticated. The Help screen is reachable before sign-in — it is exactly
   * where someone locked out of their account goes — and the website renders it
   * for anonymous visitors. Nothing here is member data.
   */
  async publicFaq(req: Request, res: Response): Promise<void> {
    const { surface } = validatedQuery<{ surface: FaqSurface }>(req);
    const payload = await faqService.publicPayload(surface);

    responseData({
      res,
      message: responseMessage("success", "fetch", "Help content"),
      result: payload,
    });
  }

  // ── Console ───────────────────────────────────────────────────────────────

  /** `GET /api/v1/admin/faqs` */
  async list(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<FaqListParams>(req);
    const { items, total } = await faqService.list(query);

    responseData({
      res,
      message: responseMessage("success", "list", "FAQ"),
      result: items,
      pagination: buildPagination(query.page, query.limit, total),
    });
  }

  /** `GET /api/v1/admin/faqs/summary` */
  async summary(_req: Request, res: Response): Promise<void> {
    responseData({
      res,
      message: responseMessage("success", "fetch", "FAQ summary"),
      result: await faqService.summary(),
    });
  }

  /**
   * `GET /api/v1/admin/faqs/categories`
   *
   * Its own endpoint rather than a field on the list response: the editor dialog
   * needs the full set to populate its dropdown, and the current page of the
   * table only contains the categories that happen to be on it.
   */
  async categories(_req: Request, res: Response): Promise<void> {
    responseData({
      res,
      message: responseMessage("success", "list", "FAQ category"),
      result: await faqService.categories(),
    });
  }

  /** `GET /api/v1/admin/faqs/:id` */
  async detail(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    responseData({
      res,
      message: responseMessage("success", "fetch", "FAQ"),
      result: await faqService.get(id),
    });
  }

  /** `POST /api/v1/admin/faqs` */
  async create(req: Request, res: Response): Promise<void> {
    const body = validatedBody<CreateFaqDto>(req);
    responseData({
      res,
      status: 201,
      message: responseMessage("success", "create", "FAQ"),
      result: await faqService.create(body),
    });
  }

  /** `PATCH /api/v1/admin/faqs/:id` */
  async update(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<UpdateFaqDto>(req);
    responseData({
      res,
      message: responseMessage("success", "update", "FAQ"),
      result: await faqService.update(id, body),
    });
  }

  /** `DELETE /api/v1/admin/faqs/:id` */
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    await faqService.remove(id);

    responseData({
      res,
      message: responseMessage("success", "delete", "FAQ"),
      result: null,
    });
  }
}

export const faqController = new FaqController();
export default faqController;
