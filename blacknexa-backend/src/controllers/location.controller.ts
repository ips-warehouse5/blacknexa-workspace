/**
 * Place search controller — `/api/v1/locations`.
 *
 * Behind the member guard, unlike the Help endpoint. There is no account data in
 * a city lookup, but the endpoint fans out to a third party on every call, and
 * leaving it open would make it a free, unattributable proxy for anyone who
 * found it.
 */

import type { Request, Response } from "express";
import locationService from "@/services/location.service";
import { responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import { validatedQuery } from "@/middlewares/validate.middleware";

class LocationController {
  /**
   * `GET /api/v1/locations/search?q=atlanta`
   *
   * An empty result set is a 200, not a 404. "No city by that name" is an
   * ordinary answer to a search — the screen prints "No areas match that
   * search", and an error status would push the client into its failure branch
   * for a query that worked exactly as intended.
   */
  async search(req: Request, res: Response): Promise<void> {
    const { q } = validatedQuery<{ q: string }>(req);
    const results = await locationService.search(q);

    responseData({
      res,
      message: responseMessage("success", "list", "Location"),
      result: { results },
    });
  }
}

export const locationController = new LocationController();
export default locationController;
