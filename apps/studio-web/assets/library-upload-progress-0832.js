(() => {
  "use strict";
  const asNum = value => Math.max(0, Number(value) || 0);
  const escaped = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const mb = bytes => {
    const number = asNum(bytes) / (1024 * 1024);
    return number >= 100 ? String(Math.round(number)) : number.toFixed(1);
  };

  function render({
    phase = "preparing", file = null, index = 1, totalFiles = 1,
    confirmedFiles = 0, failedFiles = 0, sentBytes = 0, error = ""
  } = {}) {
    const node = document.getElementById("libraryUploadProgress");
    if (!node) return;
    const total = Math.max(1, Math.floor(asNum(totalFiles)));
    const position = Math.max(1, Math.min(total, Math.floor(asNum(index)) || 1));
    const confirmed = Math.min(total, Math.floor(asNum(confirmedFiles)));
    const failed = Math.min(total, Math.floor(asNum(failedFiles)));
    const size = asNum(file && file.size);
    const sent = Math.min(size, asNum(sentBytes));
    const terminal = phase === "complete" || phase === "partial";
    const pct = terminal ? Math.floor(confirmed * 100 / total)
      : size ? Math.min(100, Math.floor(sent * 100 / size)) : 0;
    const titles = {
      preparing: "Preparing asset " + position + " of " + total,
      uploading: "Uploading asset " + position + " of " + total,
      saving: "Confirming asset " + position + " of " + total,
      saved: "Asset " + position + " of " + total + " saved",
      failed: "Asset " + position + " of " + total + " needs attention",
      complete: "All " + total + " assets saved",
      partial: confirmed + " of " + total + " assets confirmed"
    };
    const details = {
      preparing: "Checking this file before transfer. No bytes have been sent yet.",
      uploading: "Transferring the current file. Keep this tab open.",
      saving: "The browser sent the file. Waiting for Asset Manager to confirm it was stored.",
      saved: "The server confirmed this asset was saved.",
      failed: String(error || "No save confirmation was received.") + " Check Asset Manager before retrying to avoid duplicates.",
      complete: "The server confirmed every asset. Classification continues separately.",
      partial: failed + " asset(s) need attention. Check Asset Manager before retrying to avoid duplicates."
    };
    const name = String(file && file.name || "");
    const title = titles[phase] || titles.preparing;
    const detail = details[phase] || details.preparing;
    node.hidden = false;
    node.dataset.heal = phase === "failed" || phase === "partial" ? "error"
      : phase === "saved" || phase === "complete" ? "ready" : "uploading";
    node.innerHTML =
      "<strong>" + escaped(title) + "</strong>" +
      (name ? '<div class="library-transfer-file" title="' + escaped(name) + '">' + escaped(name) + "</div>" : "") +
      '<div class="library-transfer-track" role="progressbar" aria-label="Asset transfer progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '">' +
        '<div class="library-transfer-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="library-transfer-stats"><span>' +
        (terminal ? "Batch confirmation" : mb(sent) + " of " + mb(size) + " MB transferred") +
        '</span><span>' + pct + "%</span></div>" +
      '<span class="library-transfer-description">' + escaped(detail) + "</span>" +
      '<em class="item4-upload-progress-count">' + confirmed + " of " + total + " assets confirmed" +
      (failed ? " · " + failed + " need attention" : "") + "</em>";
  }

  // Asset Manager uses one server request per asset, not multipart R2 segments.
  // Report actual browser transfer bytes; confirm saved files ONLY from the API.
  function post({ url, form, file, onProgress, timeoutMs = 180000 } = {}) {
    return new Promise((resolve, reject) => {
      if (!url || !form || typeof XMLHttpRequest !== "function") {
        reject(new Error("Upload progress is unavailable. Reload Studio before retrying."));
        return;
      }
      const xhr = new XMLHttpRequest();
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve(result);
      };
      xhr.open("POST", url, true);
      xhr.withCredentials = true;
      xhr.timeout = timeoutMs;
      xhr.upload.onprogress = event => {
        if (Number(event.loaded) >= 0) {
          const sent = Math.min(asNum(file && file.size), asNum(event.loaded));
          if (!settled) onProgress && onProgress({ phase: "uploading", sentBytes: sent });
        }
      };
      xhr.upload.onload = () => {
        if (!settled) onProgress && onProgress({ phase: "saving", sentBytes: asNum(file && file.size) });
      };
      xhr.onload = () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText || "{}"); }
        catch {
          finish(new Error("Upload server response was unreadable. Check Asset Manager before retrying."));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300 || !body || typeof body !== "object" || body.ok === false) {
          const error = new Error(body?.error || body?.message || "Upload failed (" + xhr.status + ")");
          error.status = xhr.status;
          finish(error);
          return;
        }
        const count = Number(body.uploaded || 0) ||
          (Array.isArray(body.records) ? body.records.length : 0) || (body.id ? 1 : 0);
        if (count <= 0) {
          finish(new Error("Server did not confirm a saved asset. Check Asset Manager before retrying."));
          return;
        }
        finish(null, body);
      };
      xhr.onerror = () => finish(new Error("Upload connection interrupted. Server receipt is unverified."));
      xhr.ontimeout = () => finish(new Error("Upload confirmation timed out. Server receipt is unverified."));
      xhr.onabort = () => finish(new Error("Upload was interrupted. Server receipt is unverified."));
      try { xhr.send(form); } catch (error) { finish(error); }
    });
  }

  window.StudioLibraryUploadProgress = Object.freeze({ render, post });
})();