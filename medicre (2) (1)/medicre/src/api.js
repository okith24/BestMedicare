export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function inferredBackendBaseUrl() {
  if (API_BASE_URL) {
    return API_BASE_URL;
  }
  if (typeof window === "undefined") {
    return "http://localhost:5000";
  }
  return `${window.location.protocol}//${window.location.hostname}:5000`;
}

function extractHtmlErrorMessage(payload) {
  const text = String(payload || "");
  const cannotMatch = text.match(/Cannot\s+(GET|POST|PUT|PATCH|DELETE)\s+([^\s<]+)/i);
  if (cannotMatch) {
    return `${cannotMatch[1].toUpperCase()} ${cannotMatch[2]} is not available on the active backend server`;
  }
  return text;
}

async function performFetch(baseUrl, path, options, headers) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return { response, payload };
}

export async function apiFetch(path, options = {}) {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("bmn_auth_token") || ""
      : "";

  const mergedHeaders = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token && !mergedHeaders.Authorization) {
    mergedHeaders.Authorization = `Bearer ${token}`;
  }

  let result;
  try {
    result = await performFetch(API_BASE_URL, path, options, mergedHeaders);
  } catch {
    throw new Error(
      `Cannot reach backend server at ${API_BASE_URL || inferredBackendBaseUrl()}. Start backend (\`node server.js\`) and check the configured port.`
    );
  }

  let { response, payload } = result;

  const isApiPath = typeof path === "string" && path.startsWith("/api/");
  const method = String(options.method || "GET").toUpperCase();
  const missingRouteOnFrontendDevServer =
    typeof payload === "string" &&
    payload.includes(`Cannot ${method} ${path}`);

  if (!response.ok && isApiPath && missingRouteOnFrontendDevServer) {
    try {
      const fallbackResult = await performFetch(
        inferredBackendBaseUrl(),
        path,
        options,
        mergedHeaders
      );
      response = fallbackResult.response;
      payload = fallbackResult.payload;
    } catch {
      // Keep original failure payload below.
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? extractHtmlErrorMessage(payload)
        : payload?.message || "Request failed";
    throw new Error(message);
  }

  return payload;
}
