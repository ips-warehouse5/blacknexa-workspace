/**
 * Weather Intelligence — a thin proxy over Open-Meteo.
 *
 * Ported from `platform/enterprise.ts`. Proxied rather than called directly from
 * the app so the response shape stays under our control and the upstream can be
 * swapped or cached without a client release. Open-Meteo needs no API key, so
 * there is no secret to protect here — only the contract.
 */

import logger from "@/utils/logger.util";
import { fetchWithTimeout } from "@/utils/http.util";

/** Shape both clients decode (`WeatherWidget.tsx` and `WeatherWidget.swift`). */
export interface WeatherPayload {
  coordinates: { lat: number; lon: number };
  currentWeather: Record<string, unknown>;
}

class WeatherService {
  /**
   * Current conditions for a coordinate pair.
   *
   * Returns a discriminated result so the controller can map failures to the same
   * status codes the original used (502 upstream, 500 unexpected).
   */
  async getGlobalWeather(
    lat: number,
    lon: number,
  ): Promise<
    { success: true; data: WeatherPayload; status: number } | { success: false; error: string; status: number }
  > {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;

    const res = await fetchWithTimeout(url, { method: "GET" }, 10_000);
    if (!res) {
      return {
        success: false,
        error: "Weather intelligence data stream unavailable.",
        status: 500,
      };
    }
    if (!res.ok) {
      logger.warn("[weather] upstream non-ok", { status: res.status });
      return {
        success: false,
        error: "Weather intelligence data stream unavailable.",
        status: 502,
      };
    }

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) {
      return {
        success: false,
        error: "Weather intelligence data stream unavailable.",
        status: 502,
      };
    }

    return {
      success: true,
      data: {
        coordinates: { lat, lon },
        currentWeather: (data.current as Record<string, unknown>) ?? {},
      },
      status: 200,
    };
  }
}

export const weatherService = new WeatherService();
export default weatherService;
