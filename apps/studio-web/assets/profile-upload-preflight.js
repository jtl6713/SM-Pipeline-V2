(() => {
  "use strict";

  // A deliberately small, local check. Unknown places never block an upload,
  // and the matching text is not sent to an external geolocation service.
  const regions = [
    {
      id: "chicago", label: "Chicago",
      profile: /\bchicago\b/i,
      clues: [
        /\bchicago\b/, /\bnavy pier\b/, /\bmillennium park\b/, /\bwillis tower\b/,
        /\bwrigley field\b/, /\bmagnificent mile\b/, /\bbuckingham fountain\b/,
        /\bfield museum\b/, /\bart institute of chicago\b/, /\bstreeterville\b/,
        /\bcloud gate\b/, /\bthe bean\b/, /\bchicago riverwalk\b/,
        /\b360 chicago\b/, /\blincoln park zoo\b/,
      ],
    },
    {
      id: "nyc", label: "New York",
      profile: /\b(?:new york|nyc|ny shining)\b/i,
      clues: [
        /\bnew york(?: city)?\b/, /\bnyc\b/, /\bmanhattan\b/, /\bbrooklyn\b/,
        /\btimes square\b/, /\bcentral park\b/, /\bempire state building\b/,
        /\bbrooklyn bridge\b/, /\btribeca\b/, /\bhells kitchen\b/,
        /\bworld trade center\b/, /\bone world trade\b/, /\bwall street\b/,
        /\bstatue of liberty\b/, /\bfinancial district nyc\b/,
      ],
    },
    {
      id: "la", label: "Los Angeles",
      profile: /\b(?:los angeles|la shining)\b/i,
      clues: [
        /\blos angeles\b/, /\bdowntown la\b/, /\bhollywood\b/, /\bbeverly hills\b/,
        /\bsanta monica\b/, /\bvenice beach\b/, /\bgriffith observatory\b/,
        /\bhuntington beach\b/, /\blong beach california\b/, /\bmalibu\b/,
        /\bgriffith park\b/, /\bhollywood sign\b/, /\blax airport\b/,
      ],
    },
    {
      id: "miami", label: "Miami",
      profile: /\bmiami\b/i,
      clues: [
        /\bmiami\b/, /\bwynwood\b/, /\blittle havana\b/, /\bbrickell\b/,
        /\bsouth beach\b/, /\bvizcaya\b/, /\bbayside marketplace\b/,
        /\bkey biscayne\b/, /\bcoral gables\b/, /\bocean drive miami\b/,
        /\bmiami beach\b/,
      ],
    },
  ];

  const uploadInputs = new Set([
    "azFinishedInput", "ezMediaInput", "ezClipInput",
    "item4MediaInput", "item4ClipInput",
    "libraryFileInput", "libraryZoneInput", "libraryChooseInput", "libraryClipInput",
  ]);
  const uploadZones = new Set([
    "azFinishedZone", "ezUploadZone", "item4UploadZone", "libraryUploadZone",
  ]);
  const replayedEvents = new WeakSet();
  let promptActive = false;

  function clean(value) {
    return String(value || "").normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/['’]/g, "")
      .replace(/[_/\\.,()[\]-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function profileRegion(name) {
    const normalized = clean(name);
    return regions.find((region) => region.profile.test(normalized)) || null;
  }

  function regionsIn(value) {
    const normalized = clean(value);
    if (!normalized) return [];
    return regions.filter((region) => region.clues.some((pattern) => pattern.test(normalized)));
  }

  function inspect({ profileName = "", location = "", batchName = "", files = [] } = {}) {
    const selected = profileRegion(profileName);
    if (!selected) return null;
    const entries = [
      { source: "Location", text: location },
      { source: "Asset name", text: batchName },
      ...Array.from(files || []).slice(0, 100).map((file) => ({
        source: "Filename", text: file?.name || "",
      })),
    ];
    for (const entry of entries) {
      const hits = regionsIn(entry.text);
      // Mixed-city captions are not sufficient evidence that the profile is wrong.
      if (hits.length !== 1 || hits[0].id === selected.id) continue;
      return {
        selected: selected.label,
        suggested: hits[0].label,
        cue: String(entry.text || "").slice(0, 140),
        source: entry.source,
      };
    }
    return null;
  }

  function context(inputId, files) {
    const select = document.getElementById("studioProfileSelect");
    const profileName = String(select?.selectedOptions?.[0]?.textContent || "").trim();
    const library = inputId.startsWith("library");
    const finished = inputId.startsWith("azFinished");
    const locationIds = library ? ["libraryLocation"]
      : finished ? ["azFinishedLocation"]
      : inputId.startsWith("item4") ? ["prPrimaryLocation", "ezPrimaryLocation"]
      : ["ezPrimaryLocation", "prPrimaryLocation"];
    const location = locationIds.map((id) => document.getElementById(id)?.value?.trim() || "").find(Boolean) || "";
    const batchName = library ? String(document.getElementById("libraryBatchName")?.value || "").trim() : "";
    return { profileName, location, batchName, files };
  }

  function showWarning(mismatch) {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "profile-upload-preflight";
      dialog.setAttribute("aria-labelledby", "profileUploadWarningTitle");
      dialog.setAttribute("aria-describedby", "profileUploadWarningText");
      dialog.innerHTML =
        '<h2 id="profileUploadWarningTitle">Possible wrong profile</h2>' +
        '<p id="profileUploadWarningText">It appears you may be uploading to the wrong profile.</p>' +
        '<p class="profile-upload-preflight-detail"><strong>Selected profile:</strong> <span data-upload-selected></span></p>' +
        '<p class="profile-upload-preflight-detail"><strong>Location appears to be:</strong> <span data-upload-suggested></span></p>' +
        '<p class="profile-upload-preflight-clue"><span data-upload-source></span>: <span data-upload-cue></span></p>' +
        '<p>Choose <strong>Continue</strong> if this profile is intentional, or <strong>Cancel</strong> to change the profile in the header and reselect the assets.</p>' +
        '<div class="profile-upload-preflight-actions">' +
        '<button type="button" class="secondary-button" data-upload-cancel>Cancel</button>' +
        '<button type="button" class="primary-button" data-upload-continue>Continue</button></div>';
      dialog.querySelector("[data-upload-selected]").textContent = mismatch.selected;
      dialog.querySelector("[data-upload-suggested]").textContent = mismatch.suggested;
      dialog.querySelector("[data-upload-source]").textContent = mismatch.source;
      dialog.querySelector("[data-upload-cue]").textContent = mismatch.cue;
      document.body.appendChild(dialog);
      let settled = false;
      const finish = (proceed) => {
        if (settled) return;
        settled = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(proceed);
      };
      dialog.querySelector("[data-upload-cancel]").addEventListener("click", () => finish(false));
      dialog.querySelector("[data-upload-continue]").addEventListener("click", () => finish(true));
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finish(false);
      });
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
        dialog.querySelector("[data-upload-cancel]").focus();
      } else {
        const message = "It appears you may be uploading to the wrong profile.\nSelected: " +
          mismatch.selected + "\nLocation appears to be: " + mismatch.suggested +
          "\nContinue anyway? Cancel to change the profile and reselect assets.";
        finish(window.confirm(message));
      }
    });
  }

  function cancelled(inputId, target) {
    if (target?.tagName === "INPUT" && target.type === "file") target.value = "";
    const message = "Upload cancelled. Change the profile in the header, then select the assets again.";
    const id = inputId.startsWith("library") ? "libraryUploadMessage"
      : inputId.startsWith("azFinished") ? "azFinishedMessage"
      : inputId.startsWith("item4") ? "productionRequestMessage"
      : "ezMessage";
    const status = document.getElementById(id);
    if (status) {
      status.textContent = message;
      status.classList.add("error-text");
    }
    document.getElementById("studioProfileSelect")?.focus();
  }

  function intercept(event, inputId, files, reemit) {
    if (replayedEvents.has(event)) return;
    if (!Array.from(files || []).length) return;
    const snapshot = context(inputId, files);
    const mismatch = inspect(snapshot);
    if (!mismatch) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (promptActive) {
      cancelled(inputId, event.target);
      return;
    }
    promptActive = true;
    const originalProfile = document.getElementById("studioProfileSelect")?.value || "";
    void showWarning(mismatch).then((proceed) => {
      promptActive = false;
      if (proceed && originalProfile === (document.getElementById("studioProfileSelect")?.value || "")) {
        reemit();
      } else {
        cancelled(inputId, event.target);
      }
    }).catch(() => {
      promptActive = false;
      cancelled(inputId, event.target);
    });
  }

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!uploadInputs.has(input?.id)) return;
    intercept(event, input.id, input.files, () => {
      const replay = new Event("change", { bubbles: true });
      replayedEvents.add(replay);
      input.dispatchEvent(replay);
    });
  }, true);

  document.addEventListener("drop", (event) => {
    const target = event.target?.closest?.("[id]");
    const zone = event.target?.closest?.("#azFinishedZone, #ezUploadZone, #item4UploadZone, #libraryUploadZone");
    if (!zone || !uploadZones.has(zone.id)) return;
    const files = Array.from(event.dataTransfer?.files || []);
    intercept(event, zone.id, files, () => {
      const replay = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(replay, "dataTransfer", { value: { files } });
      replayedEvents.add(replay);
      zone.dispatchEvent(replay);
    });
  }, true);

  // Expose the deterministic detector for regression tests; it performs no uploads.
  window.StudioProfileUploadPreflight = { inspect, profileRegion, regionsIn };
})();
