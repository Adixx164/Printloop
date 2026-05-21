const apiUrl = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

const apiBaseUrl = apiUrl === "/api" || apiUrl.endsWith("/api") ? apiUrl : `${apiUrl}/api`;

export const CONFIG = {
  apiBaseUrl,
  appName: "PrintLoop",
  version: "1.0",
};
