/**
 * Contact-us controller.
 *
 * Thin, like the staff controller: what an operator may do lives in
 * `contact.service`, so a second entry point cannot skip the rules by not going
 * through here.
 *
 * The one thing this layer owns is request metadata. `ipAddress` and
 * `userAgent` are read off the request rather than taken from the body,
 * because a value a submitter can choose is not evidence of anything.
 */

import type { Request, Response } from "express";

import contactService from "@/services/contact.service";
import { buildPagination, responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from "@/middlewares/validate.middleware";
import type {
  ContactStatus,
  ContactSubject,
} from "@/types/contact.interface";

/** The acting operator. Present because every admin route runs behind the guard. */
function actor(req: Request): { id: string } {
  // The fallback makes a mis-ordered middleware stack fail as an unattributed
  // write rather than a crash; the guard is what actually keeps it non-empty.
  return { id: req.user?.id ?? "" };
}

class ContactController {
  /**
   * `POST /api/v1/contact` — public.
   *
   * Answers 201 with an id and nothing else. The site's own route handler only
   * checks the status code, and a public endpoint that echoes back what it
   * stored gives a submitter a way to probe the record.
   */
  async submit(req: Request, res: Response): Promise<void> {
    const body = validatedBody<{
      name: string;
      email: string;
      subject: ContactSubject;
      message: string;
    }>(req);

    const result = await contactService.submit(body, {
      ipAddress: req.ip ?? "",
      // Capped here as well as in the service: a header is attacker-controlled
      // and arbitrarily long, and it should not travel far at full length.
      userAgent: (req.get("user-agent") ?? "").slice(0, 512),
    });

    responseData({
      res,
      status: 201,
      message: "Thanks — your message has been received.",
      result,
    });
  }

  /** `GET /api/v1/admin/contact` */
  async list(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{
      page: number;
      limit: number;
      search?: string;
      status?: ContactStatus;
      subject?: ContactSubject;
    }>(req);

    const { items, total } = await contactService.list({
      page: query.page,
      limit: query.limit,
      // Spread conditionally: Joi omits absent keys rather than nulling them,
      // and the service distinguishes "no filter" from "filter on undefined".
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.subject ? { subject: query.subject } : {}),
    });

    responseData({
      res,
      message: responseMessage("success", "list", "Contact inquiries"),
      result: items,
      pagination: buildPagination(query.page, query.limit, total),
    });
  }

  /** `GET /api/v1/admin/contact/summary` — counts per status. */
  async summary(_req: Request, res: Response): Promise<void> {
    const counts = await contactService.summary();

    responseData({
      res,
      message: responseMessage("success", "fetch", "Contact summary"),
      result: counts,
    });
  }

  /** `GET /api/v1/admin/contact/:id` */
  async detail(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const inquiry = await contactService.get(id);

    responseData({
      res,
      message: responseMessage("success", "fetch", "Contact inquiry"),
      result: inquiry,
    });
  }

  /** `PATCH /api/v1/admin/contact/:id` — status and/or internal note. */
  async update(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ status?: ContactStatus; internalNote?: string }>(req);

    const inquiry = await contactService.update(id, body, actor(req));

    responseData({
      res,
      message: responseMessage("success", "update", "Contact inquiry"),
      result: inquiry,
    });
  }

  /** `DELETE /api/v1/admin/contact/:id` */
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    await contactService.remove(id, actor(req));

    responseData({
      res,
      message: responseMessage("success", "delete", "Contact inquiry"),
      result: null,
    });
  }
}

export const contactController = new ContactController();
export default contactController;
