// Authenticated original fallback for browser-safe Drive-backed image previews.
// The caller must already have authorized the Studio asset and checked Do_Not_Use.
export async function fetchAuthorizedDrivePhoto({ fileId, headers, getToken, fetchImpl = fetch }) {
  if (!fileId || !getToken) return null;
  try {
    const token = await getToken();
    if (!token) return null;
    const authHeaders = new Headers(headers);
    authHeaders.set("Authorization", `Bearer ${token}`);
    const response = await fetchImpl(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { method: "GET", headers: authHeaders, redirect: "follow" }
    );
    const type = String(response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (response.ok && /^image\/(jpeg|png|webp|gif|avif|bmp|x-ms-bmp)$/.test(type) && response.body) return response;
    try { await response.body?.cancel(); } catch {}
  } catch {
    // Preserve the existing public-original fallback without exposing credentials.
  }
  return null;
}
