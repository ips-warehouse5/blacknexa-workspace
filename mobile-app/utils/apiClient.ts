/**
 * Central API Client for making HTTP requests with structured console logging.
 *
 * Logged details:
 *  - Endpoint URL
 *  - HTTP Request Method (GET, POST, etc.)
 *  - Request Parameters / Body
 *  - Response Status Code
 *  - Response JSON Payload
 */

export type ApiClientOptions = RequestInit & {
  params?: Record<string, any>;
};

// Auto-install a global fetch & XMLHttpRequest interceptor to capture and log ANY fetch request in the app
// AND ensure XMLHttpRequest is hooked so React Native DevTools Network tab receives the events
if (typeof global !== "undefined" && !(global as any).__BLACKNEXA_FETCH_INTERCEPTOR_INSTALLED__) {
  (global as any).__BLACKNEXA_FETCH_INTERCEPTOR_INSTALLED__ = true;

  // React Native DevTools Network Tab / Flipper bridge compatibility
  if ((global as any).XMLHttpRequest && (global as any).XMLHttpRequest.prototype) {
    const originalOpen = (global as any).XMLHttpRequest.prototype.open;
    const originalSend = (global as any).XMLHttpRequest.prototype.send;

    (global as any).XMLHttpRequest.prototype.open = function (
      method: string,
      url: string,
      ...rest: any[]
    ) {
      this._url = url;
      this._method = method;
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    (global as any).XMLHttpRequest.prototype.send = function (body?: any) {
      if (this._url) {
        // Let React Native's NativeModules networking inspector track XHR
      }
      return originalSend.apply(this, [body]);
    };
  }

  const originalFetch = global.fetch;
  global.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = init?.method || "GET";

    let reqBody: any = null;
    if (init?.body) {
      try {
        reqBody = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      } catch {
        reqBody = init.body;
      }
    }

    // Dynamically extract short endpoint path and friendly API Name
    let endpointPath = url;
    let apiName = "API Request";
    try {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        const parsedUrl = new URL(url);
        endpointPath = parsedUrl.pathname + (parsedUrl.search || "");
        const path = parsedUrl.pathname;

        if (path.includes("/news/feed")) apiName = "News Feed";
        else if (path.includes("/news/briefings")) apiName = "News Briefings";
        else if (path.includes("/news/local")) apiName = "Local News Feed";
        else if (path.includes("/news/generate")) apiName = "AI News Generation";
        else if (path.includes("/news/translate")) apiName = "Article Translation";
        else if (path.includes("/news/audio")) apiName = "Article Audio Briefing";
        else if (path.includes("/blacknexa/weather")) apiName = "Weather Intelligence";
        else if (path.includes("/blacknexa/live-chat")) apiName = "Community Live Chat";
        else if (path.includes("/blacknexa/artists/tip")) apiName = "Artist Micro-Tipping";
        else if (path.includes("/blacknexa/hardware/beacon-trigger")) apiName = "Safety Panic Beacon";
        else if (path.includes("/blacknexa/publish-verified-story")) apiName = "Publish Verified Story";
        else if (path.includes("/geo-legal/lookup")) apiName = "Geo-Legal Lookup";
        else if (path.includes("/geo-legal/validate")) apiName = "Geo-Legal Validation";
        else if (path.includes("/geo-legal/dispatch")) apiName = "Geo-Legal Dispatch";
        else if (path.includes("/platform/tipping/creator/register")) apiName = "Register Creator Ledger";
        else if (path.includes("/platform/tipping/creator") && path.includes("/balance")) apiName = "Creator Balance";
        else if (path.includes("/platform/tipping/payout/request")) apiName = "Creator Payout Request";
        else if (path.includes("/oauth/initiate")) apiName = "OAuth Initiate";
        else if (path.includes("/oauth/token")) apiName = "OAuth Token Exchange";
        else if (path.includes("/oauth/refresh")) apiName = "OAuth Token Refresh";
        else if (path.includes("/speech-model")) apiName = "AI Speech Model (TTS)";
        else if (path.includes("/transcription-model")) apiName = "AI Transcription (STT)";
        else apiName = path.split("/").filter(Boolean).slice(-2).join("/");
      }
    } catch {}

    console.groupCollapsed?.(`📡 [${method}] ${apiName} → ${endpointPath}`) ?? console.log(`📡 [${method}] ${apiName} → ${endpointPath}`);
    console.log("➜ API Name:", apiName);
    console.log("➜ Endpoint:", endpointPath);
    console.log("➜ Full URL:", url);
    console.log("➜ Method:", method);
    if (reqBody) {
      console.log("➜ Request Body / Params:", reqBody);
    }
    console.groupEnd?.();

    try {
      const response = await originalFetch(input, init);
      const cloned = response.clone();
      
      cloned.text().then((text) => {
        let parsed: any = text;
        try {
          parsed = JSON.parse(text);
        } catch {}

        const statusIcon = response.ok ? "📥" : "⚠️";
        console.groupCollapsed?.(`${statusIcon} [${response.status} ${response.statusText}] ${apiName} → ${endpointPath}`) ?? 
          console.log(`${statusIcon} [${response.status}] ${apiName}`);
        console.log("➜ API Name:", apiName);
        console.log("➜ Endpoint:", endpointPath);
        console.log("➜ Full URL:", url);
        console.log("➜ Status:", response.status, response.statusText);
        console.log("➜ Response JSON Object (Interactive Preview):", parsed);
        console.groupEnd?.();
      }).catch(() => {});

      return response;
    } catch (err: any) {
      console.groupCollapsed?.(`❌ [FAILED] ${apiName} → ${endpointPath}`) ?? console.error(`❌ [FAILED] ${apiName}`);
      console.error("➜ API Name:", apiName);
      console.error("➜ Endpoint:", endpointPath);
      console.error("➜ Full URL:", url);
      console.error("➜ Error Details:", err?.message || err);
      console.groupEnd?.();
      throw err;
    }
  };
}

export async function apiFetch<T = any>(
  endpoint: string,
  options?: ApiClientOptions
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const method = options?.method || "GET";
  
  // Construct URL with query parameters if present
  let fullUrl = endpoint;
  if (options?.params) {
    const urlObj = new URL(endpoint);
    Object.entries(options.params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        urlObj.searchParams.append(key, String(val));
      }
    });
    fullUrl = urlObj.toString();
  }

  try {
    const res = await fetch(fullUrl, options);
    let resJson: any = null;

    try {
      resJson = await res.json();
    } catch {
      resJson = await res.text();
    }

    return {
      ok: res.ok,
      status: res.status,
      data: resJson as T,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error?.message || "Network request failed",
    };
  }
}
