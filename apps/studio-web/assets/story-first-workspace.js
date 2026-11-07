/* Story-first storyboard workspace. All persistence is through canonical Airtable Idea routes. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const panel = $("storyFirstPanel");
  if (!panel) return;
  // Reuse the single visible Script a Short entry; the storyboard lives inside it.
  const producerPanel=$("scriptedShortPanel");
  if(producerPanel && panel.parentElement!==producerPanel)producerPanel.appendChild(panel);
  const config = window.CHICAGOSHINING_STUDIO_CONFIG || {};
  const root = String(config.apiBase || window.location.origin).replace(/\/$/, "");
  const select = $("studioProfileSelect");
  const status = $("storyFirstStatus");
  const current = { record: null, story: null, profile: "", title: "", summary: "", busy: false, ideaRecords: [], generatedAssets: {}, candidates: {}, attempted: new Set(), browsing: {}, pendingUpload: {}, libraryRows: [], wideResults: {}, uploadedAssets: {}, selectedAssetNames: {} };

  const profileId = () => String(select?.value || localStorage.getItem("studio.content_profile_id") || "").trim();
  const isId = id => /^rec[A-Za-z0-9]+$/.test(String(id || ""));
  const node = (tag, cls = "", value = "") => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value) el.textContent = value;
    return el;
  };
  const put = (parent, ...children) => { children.forEach(child => parent.appendChild(child)); return parent; };
  function report(message, error = false) {
    status.textContent = message;
    status.className = "form-message" + (error ? " error-text" : "");
  }
  async function call(path, options = {}) {
    const response = await fetch(root + path, {
      credentials: "same-origin", cache: "no-store",
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    });
    const text = await response.text();
    let result = {};
    try { result = JSON.parse(text); } catch { /* plain text failures */ }
    if (!response.ok || result.ok === false) throw new Error(result.error || result.message || "Studio request failed (" + response.status + ")");
    return result;
  }
  function storyNotesFromRecord(record) {
    if (record?.story_first?.schema === "story-first.1") return record.story_first;
    const match = String(record?.production_notes || "").split(/\r?\n/).find(line => /^\s*\[story-first\.1\]\s*\{/.test(line));
    if (!match) return null;
    try { return JSON.parse(match.replace(/^\s*\[story-first\.1\]\s*/, "")); } catch { return null; }
  }
  function assertProfile() {
    const id = profileId();
    if (!isId(id)) throw new Error("Select a city profile before editing a story.");
    if (current.profile && current.profile !== id) throw new Error("Your selected profile changed. Reopen the idea for that profile.");
    return id;
  }
  function label(parent, title, value = "", type = "textarea") {
    // put() returns its PARENT, not the appended element. Keep each SVG,
    // caption and editor within the label; otherwise prepended scene icons
    // escape to the card itself and stack above the scene header.
    const wrap = node("label", "story-first-field");
    parent.appendChild(wrap);
    put(wrap, node("span", "", title));
    const input = node(type === "select" ? "select" : type === "input" ? "input" : "textarea");
    input.value = value || "";
    if (type === "textarea") input.rows = 2;
    wrap.appendChild(input);
    return input;
  }
  function button(text, className, action, parent) {
    const b = node("button", className, text);
    b.type = "button";
    b.addEventListener("click", action);
    if (parent) parent.appendChild(b);
    return b;
  }
  function markEditing() { report("Unsaved changes — use Save idea before leaving this screen."); }
  function readForm() {
    if (!current.story) throw new Error("Propose or reopen a storyboard first.");
    current.title = String($("storyFirstTitle").value || "").trim();
    current.summary = String($("storyFirstSummary").value || "").trim();
    if (!current.title) throw new Error("Give this storyboard a title before saving.");
    if (current.summary.length > 5000) throw new Error("Creative direction must be 5,000 characters or fewer.");
    return current.story;
  }
  function clock(t) { return String(t || "").replace(/-/g, "–") + "s"; }
  async function refresh(keep = false) {
    const id = profileId();
    if (!isId(id)) { report("Select a profile to load saved storyboards."); return; }
    const result = await call("/api/ideas?limit=100&fresh=1&profile=" + encodeURIComponent(id));
    if (result.live !== true || !Array.isArray(result.records)) throw new Error("Saved Ideas could not be verified against Airtable.");
    current.ideaRecords = result.records.filter(row =>
      Array.isArray(row.content_profile_links) && row.content_profile_links.includes(id) && storyNotesFromRecord(row));
    const picker = $("storyFirstSaved");
    const wanted = keep ? current.record?.id : picker.value;
    picker.replaceChildren(new Option("Choose a saved storyboard…", ""));
    current.ideaRecords.forEach(row => picker.add(new Option(row.title + " · Idea " + (row.candidate_id || row.id), row.id)));
    if (wanted && current.ideaRecords.some(row => row.id === wanted)) picker.value = wanted;
    $("storyFirstSavedHint").textContent = current.ideaRecords.length
      ? current.ideaRecords.length + " saved story-first idea(s) in this profile."
      : "No story-first ideas yet for this profile.";
  }
  function openRecord(record) {
    const id = assertProfile();
    if (!record || !Array.isArray(record.content_profile_links) || !record.content_profile_links.includes(id)) {
      throw new Error("That idea belongs to another profile.");
    }
    const story = storyNotesFromRecord(record);
    if (!story?.scenes?.length || story.profile_id !== id) throw new Error("This Idea has no valid story-first storyboard for the selected city.");
    current.record = record;
    current.story = JSON.parse(JSON.stringify(story));
    current.candidates = {}; current.attempted = new Set(); current.browsing = {};
    const voiceovers = String(record.summary || "").split(/\r?\n/).filter(line => /^\s*[1-9]\d*\.\s+/.test(line) && !/\s\u2014\s/.test(line)).map(line => line.replace(/^\s*\d+\.\s+/, "").trim());
    if (voiceovers.length === current.story.scenes.length && current.story.scenes.every(row => !row.voiceover)) {
      current.story.scenes.forEach((row, i) => { row.voiceover = voiceovers[i]; });
    }
    current.profile = id;
    current.title = String(record.title || "");
    current.summary = String(record.summary || "");
    current.libraryRows = [];
    localStorage.setItem("studio.story_first_resume." + id, record.id);
    render();
    // Rehydrate filenames for existing selections by exact record ID; do not rely
    // on the scene keyword search or the latest-100 list after reopen.
    void loadSelectedAssetNames();
    // Per-scene discovery is launched by render() after the complete story is loaded.
    $("storyFirstSaved").value = record.id;
    report("Reopened saved Idea " + (record.candidate_id || record.id) + ". All shot requirements and sourcing choices are preserved.");
  }
  // A confirmed Airtable response is the save receipt. Updating the local picker
  // must not require another network request (especially on mobile Safari).
  function rememberSavedIdea(record) {
    const index = current.ideaRecords.findIndex(row => row.id === record.id);
    if (index >= 0) current.ideaRecords[index] = record;
    else current.ideaRecords.unshift(record);
    const picker = $("storyFirstSaved");
    if (picker) {
      let option = Array.from(picker.options).find(row => row.value === record.id);
      if (!option) {
        option = new Option("", record.id);
        picker.add(option);
      }
      option.textContent = record.title + " · Idea " + (record.candidate_id || record.id);
      picker.value = record.id;
    }
    $("storyFirstSavedHint").textContent = "Saved Idea is available to reopen here. Use Refresh saved ideas to check for other changes.";
  }
  function interruptedSave(error) {
    return error?.name === "AbortError" || error?.name === "TypeError"
      || /fetch is aborted|aborted|failed to fetch|network|load failed|timed out|timeout/i.test(String(error?.message || ""));
  }
  // A request may finish its Airtable PATCH after the phone loses its response.
  // Only call it saved if a fresh, authorized GET actually matches this payload.
  function savedIdeaMatches(record, submitted) {
    const saved = storyNotesFromRecord(record), expected = submitted.storyboard;
    if (!record?.id || String(record.title || "") !== submitted.title
      || String(record.summary || "") !== submitted.summary
      || saved?.schema !== "story-first.1"
      || saved.profile_id !== submitted.content_profile_id
      || Number(saved.target_seconds) !== Number(expected.target_seconds)
      || !Array.isArray(saved.scenes) || saved.scenes.length !== expected.scenes.length) return false;
    const textKeys = ["time","visual","voiceover","media","decision","candidate_asset_id",
      "assigned_asset_id","generated_master_id","accepted_generated_master_id","selected_origin",
      "ai_prompt","capture_note"];
    const boolKeys = ["selected_approved","media_override"];
    return saved.scenes.every((scene, index) => {
      const wanted = expected.scenes[index];
      return textKeys.every(key => String(scene[key] ?? "") === String(wanted[key] ?? ""))
        && boolKeys.every(key => Boolean(scene[key]) === Boolean(wanted[key]))
        && JSON.stringify(scene.candidate_assets || []) === JSON.stringify(wanted.candidate_assets || [])
        && JSON.stringify(scene.rejected_ai_ids || []) === JSON.stringify(wanted.rejected_ai_ids || []);
    });
  }
  async function save() {
    if (current.busy) throw new Error("Another storyboard action is still running.");
    const story = readForm();
    const id = assertProfile();
    current.busy = true;
    const saveButton = $("storyFirstSave");
    saveButton.disabled = true;
    report("Saving storyboard to Airtable…");
    try {
      const body = {
        title: current.title,
        summary: current.summary,
        content_profile_id: id,
        storyboard: { ...story, profile_id: id },
      };
      let result;
      if (current.record?.id) {
        const recordId = current.record.id;
        try {
          result = await call("/api/ideas/" + encodeURIComponent(recordId) + "?profile=" + encodeURIComponent(id), {
            method: "PATCH", body: JSON.stringify(body),
          });
        } catch (error) {
          if (!interruptedSave(error)) throw error;
          // A lost PATCH response is ambiguous. Re-read the authoritative Idea
          // without repeating the mutation or risking duplicate side effects.
          let verified = null;
          try {
            const read = await call("/api/ideas/" + encodeURIComponent(recordId) + "?profile=" + encodeURIComponent(id));
            if (read.record?.id === recordId && savedIdeaMatches(read.record, body)) verified = read.record;
          } catch { /* read-back may be unavailable too */ }
          if (!verified) throw new Error("Save was not confirmed (" +
            (error?.message || "connection interrupted") +
            "). Your changes are still on this screen. Check the saved Idea before retrying.");
          result = { record: verified, verified_after_interruption: true };
        }
      } else {
        try {
          result = await call("/api/ideas?profile=" + encodeURIComponent(id), {
            method: "POST", body: JSON.stringify({ ...body, input_kind: "story-first" }),
          });
        } catch (error) {
          // Do not repeat an ambiguous create; it may already exist in Airtable.
          throw new Error("New Idea save was not confirmed (" + (error?.message || "connection interrupted") +
            "). Check Saved Ideas before trying again to avoid creating a duplicate.");
        }
      }
      if (!result.record?.id) throw new Error("Studio did not return the saved Idea ID.");
      current.record = result.record;
      current.story = JSON.parse(JSON.stringify(storyNotesFromRecord(result.record) || story));
      localStorage.setItem("studio.story_first_resume." + id, result.record.id);
      // A successful Airtable write is already the receipt. Keep the saved-Ideas
      // selector current locally; do not issue an abort-prone second network request.
      rememberSavedIdea(result.record);
      report("Saved to Airtable · Idea " + (result.record.candidate_id || result.record.id) +
        (result.verified_after_interruption ? " · Verified after connection interruption." :
          ". You can leave and reopen it from Ideas."));
      return result.record;
    } finally {
      current.busy = false;
      saveButton.disabled = false;
    }
  }
  async function openAssetManager() {
    await save();
    const tab = document.querySelector('[data-page="library"]');
    if (!tab) throw new Error("Asset Manager navigation is not available.");
    tab.click();
  }

  const stopWords = new Set("the and with from into this that there is are of in on at for near city chicago scene image clip photo video downtown morning early bright show showing still a an".split(" "));
  function tokens(value) { return new Set(String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 2 && !stopWords.has(x))); }
  function eligible(row) {
    return row && row.content_profile_id === current.profile && !row.do_not_use
      && ["owned","licensed","cleared","public domain"].includes(String(row.rights_status || "").toLowerCase())
      && ["available","ready"].includes(String(row.status || "").toLowerCase())
      && Boolean(row.google_drive_file_id);
  }
  function isClip(row) { return row.media_kind === "video" || String(row.mime_type || "").startsWith("video/"); }
  function rankCandidate(scene, row) {
    if (!eligible(row) || (scene.media === "clip" && !isClip(row))) return null;
    const subject = String(scene.visual || "").toLowerCase();
    const info = [row.name,row.location,row.description].filter(Boolean).join(" ").toLowerCase();
    if (/\bsunrise|dawn|pre-sunrise|early morning\b/.test(subject) && /\bnoon|midday|afternoon|sunset|night\b/.test(info)) return null;
    if (/\bnight|after dark\b/.test(subject) && /\bdaylight|noon|afternoon|sunrise\b/.test(info)) return null;
    const match = [...tokens(scene.visual)].filter(token => tokens(info).has(token));
    const distinctive = match.filter(token => !["view","skyline","river","morning","dawn","sunrise","light"].includes(token));
    if (!distinctive.length && match.length < 2) return null;
    return {row, score: distinctive.length * 3 + match.length, reason: "Metadata: " + match.slice(0,3).join(", ") + " — verify visually"};
  }
  async function discoverLibrary() {
    const id = assertProfile();
    const rows = [];
    let offset = "";
    for (let page = 0; page < 3; page++) {
      const result = await call("/api/library?profile=" + encodeURIComponent(id) + "&limit=100&sort=newest" +
        (offset ? "&offset=" + encodeURIComponent(offset) : ""));
      if (!Array.isArray(result.records)) throw new Error("Asset Manager list was not returned");
      rows.push(...result.records.filter(row => row.content_profile_id === id));
      offset = String(result.offset || "");
      if (!offset) break;
    }
    current.libraryRows = rows;
    if (!current.story) return;
    current.story.scenes.forEach(scene => {
      const hits = rows.map(row => rankCandidate(scene, row)).filter(Boolean)
        .sort((a,b) => b.score - a.score).slice(0,3);
      scene.candidate_assets = hits.map(hit => ({ id: hit.row.id, reason: hit.reason }));
      if (hits.length) scene.candidate_asset_id = hits[0].row.id;
    });
    render();
  }
  async function loadSelectedAssetNames() {
    const snapshot = current.story, profile = current.profile;
    if (!snapshot || !isId(profile)) return;
    const ids = [...new Set(snapshot.scenes.filter(scene => scene.selected_approved)
      .map(scene => scene.assigned_asset_id).filter(isId))]
      .filter(id => !current.selectedAssetNames[id]);
    if (!ids.length) return;
    try {
      const result = await call("/api/library?profile=" + encodeURIComponent(profile) +
        "&ids=" + encodeURIComponent(ids.join(",")));
      if (current.story !== snapshot || current.profile !== profile) return;
      let changed = false;
      for (const asset of result.records || []) {
        if (asset.content_profile_id !== profile || !ids.includes(asset.id)) continue;
        const name = String(asset.name || asset.filename || asset.title || "").trim();
        if (name) { current.selectedAssetNames[asset.id] = name; changed = true; }
      }
      if (changed) render();
    } catch (error) {
      // Cosmetic metadata failure must never overwrite the save confirmation.
      console.warn("Selected media filename lookup unavailable", error);
    }
  }
  function selectedCount() {
    return current.story.scenes.filter(scene => scene.selected_approved === true && isId(scene.assigned_asset_id)
      && scene.state === "media_approved").length;
  }
  function sceneStatus(scene) {
    if (scene.selected_approved && isId(scene.assigned_asset_id)) return "Media Selected";
    if (scene.generated_master_id) return "Awaiting Image Review";
    if (scene.decision === "capture") return "Awaiting Your Media";
    if ((scene.candidate_assets || []).length) return "Candidates Available";
    return "Missing Media";
  }
  async function reopenLatest() {
    const id = assertProfile();
    const data = await call("/api/ideas/" + current.record.id + "?profile=" + encodeURIComponent(id));
    if (!data.record) throw new Error("Saved storyboard could not be reloaded");
    const savedRows = current.libraryRows, uploaded = current.uploadedAssets;
    openRecord(data.record);
    current.libraryRows = savedRows; current.uploadedAssets = uploaded;
    render();
  }
  async function selectAsset(index, asset) {
    readForm();
    if (!eligible(asset)) throw new Error("This asset is not eligible for the selected Content Profile.");
    const scene = current.story.scenes[index];
    if (scene.media === "clip" && !isClip(asset)) throw new Error("This scene requires footage, not a still.");
    const old = { ...scene };
    scene.decision = "library";
    scene.assigned_asset_id = asset.id;
    scene.assigned_asset_name = String(asset.name || asset.filename || asset.title || "").trim();
    scene.selected_approved = true;
    scene.state = "media_approved";
    try { await save(); render(); }
    catch (error) {
      if (!error.saveUnconfirmed) Object.assign(scene, old);
      render(); throw error;
    }
  }
  async function browseAssets(index, query = "") {
    const id = assertProfile();
    const result = await call("/api/library?profile=" + encodeURIComponent(id) + "&limit=100" +
      (query ? "&q=" + encodeURIComponent(query) : ""));
    current.wideResults[index] = (result.records || []).filter(eligible)
      .filter(row => current.story.scenes[index].media !== "clip" || isClip(row));
    render();
  }
  async function uploadFile(index, file, progress) {
    if (!file) return;
    const scene = current.story.scenes[index];
    if (scene.media === "clip" && !String(file.type).startsWith("video/")) throw new Error("A video clip is required.");
    await save();
    const id = assertProfile();
    const body = new FormData();
    body.append("content_profile_id", id);
    body.append("batch_name", current.title.slice(0, 65) + " Scene " + (index + 1));
    body.append("description", "Script a Short Idea " + current.record.id + " scene " + (index + 1) + ": " + scene.visual);
    body.append("files", file, file.name);
    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", root + "/api/library?profile=" + encodeURIComponent(id));
      xhr.withCredentials = true;
      xhr.upload.onprogress = e => {
        progress.textContent = e.lengthComputable ? "Uploading " + file.name + ": " +
          Math.round(100 * e.loaded / e.total) + "%" : "Uploading " + file.name + "…";
      };
      xhr.onerror = () => reject(new Error("Upload interrupted; no media selected"));
      xhr.onabort = () => reject(new Error("Upload cancelled; no media selected"));
      xhr.onload = () => {
        let reply = {};
        try { reply = JSON.parse(xhr.responseText || "{}"); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && reply.ok !== false) resolve(reply);
        else reject(new Error(reply.error || "Media upload failed"));
      };
      xhr.send(body);
    });
    const uploaded = (data.records || data.uploaded || data.assets || [])[0];
    if (!uploaded?.id) throw new Error("Upload sent, but catalog registration was not confirmed. Check Asset Manager.");
    current.uploadedAssets[index] = uploaded;
    current.libraryRows.unshift(uploaded);
    render();
    report("Upload complete. Review the new asset and choose Select This Asset.");
  }
  function candidateCard(parent, index, asset, reason = "") {
    const wrapper = node("div", "story-first-asset");
    const img = node("img", "story-first-asset-preview");
    img.src = root + "/api/media-assets/" + encodeURIComponent(asset.id) + "/preview";
    img.loading = "lazy"; img.alt = asset.name || "Media candidate";
    wrapper.appendChild(img);
    const copy = node("div");
    put(copy, node("strong", "", asset.name || "Media Asset"),
      node("p", "subtle", (isClip(asset) ? "Video clip" : "Image") +
        (reason ? " · " + reason : "")));
    if (isClip(asset)) {
      const link = node("a", "story-first-preview", "Preview video");
      link.href = root + "/api/media-assets/" + encodeURIComponent(asset.id) + "/stream";
      link.target = "_blank"; link.rel = "noopener noreferrer";
      copy.appendChild(link);
    }
    button("Select This Asset", "secondary-button", () => selectAsset(index, asset).catch(e => report(e.message, true)), copy);
    wrapper.appendChild(copy); parent.appendChild(wrapper);
  }
  async function reviewImage(index, accept, override = false) {
    const scene = readForm().scenes[index];
    if (!scene.generated_master_id) throw new Error("No generated image is awaiting review.");
    await save();
    const action = accept ? "accept" : "decline";
    const result = await call("/api/story-first/ideas/" + current.record.id + "/scenes/" + (index + 1) + "/" + action +
      "?profile=" + encodeURIComponent(assertProfile()), {
      method: "POST", body: JSON.stringify({ generated_master_id: scene.generated_master_id,
        content_profile_id: assertProfile(), media_override: override }),
    });
    await reopenLatest();
    report(accept ? "AI image accepted and registered to the exact scene in Drive and Airtable."
      : "AI image declined. You can generate again or supply media.");
    return result;
  }

  function sceneUrl(index, action) {
    if (!isId(current.record?.id)) throw new Error("Save this idea before requesting images.");
    return "/api/story-first/ideas/" + current.record.id + "/scenes/" + (index+1) + "/" + action;
  }
  async function reloadIdea() {
    const profile = assertProfile();
    const result = await call("/api/ideas/" + current.record.id + "?profile=" + encodeURIComponent(profile));
    if (!result.record) throw new Error("Could not verify saved Idea from Airtable");
    openRecord(result.record);
  }
  async function generateSceneImage(index) {
    if (current.busy) return;
    const scene = readForm().scenes[index];
    if (!String(scene?.ai_prompt || "").trim()) throw new Error("Add an AI image prompt first.");
    if (!confirm("Generate one AI image for scene " + (index+1) + "? This creates no Production Request.")) return;
    await save();
    current.busy = true;
    report("Generating one image for scene " + (index+1) + "…");
    try {
      await call(sceneUrl(index,"generate") + "?profile=" + encodeURIComponent(assertProfile()), {
        method:"POST", body:JSON.stringify({prompt:scene.ai_prompt,content_profile_id:assertProfile()})
      });
      await reloadIdea();
      report("Image generated. Review and Accept or Decline before it is used.");
    } finally { current.busy = false; }
  }
  async function decideGenerated(index, action) {
    if (current.busy) return;
    const scene = current.story?.scenes?.[index];
    if (!scene?.generated_master_id) throw new Error("No pending image is available for review.");
    let mediaOverride = false;
    if (action === "accept" && scene.media === "clip") {
      mediaOverride = confirm("This scene calls for moving footage. Explicitly accept a still image instead?");
      if (!mediaOverride) return;
    }
    await save();
    current.busy = true;
    try {
      report(action === "accept" ? "Registering accepted image in Drive and Media Assets…" : "Declining the image…");
      await call(sceneUrl(index,action) + "?profile=" + encodeURIComponent(assertProfile()), {
        method:"POST",body:JSON.stringify({generated_master_id:scene.generated_master_id,
          content_profile_id:assertProfile(),media_override:mediaOverride})
      });
      await reloadIdea();
      report(action === "accept" ? "Scene " + (index+1) + " image accepted and saved." :
        "Declined. Generate again or supply the media yourself.");
    } finally { current.busy = false; }
  }
  function keyTerms(value) {
    return [...new Set(String(value || "").toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/)
      .filter(s=>s.length>=4 && !["with","from","then","this","that","scene","still","video",
        "image","photo","through","looking","view","chicago","downtown","early","quiet"].includes(s)))];
  }
  function eligibility(scene, asset) {
    if (!asset || asset.content_profile_id !== assertProfile() || asset.do_not_use ||
        !asset.google_drive_file_id || !["available","ready"].includes(String(asset.status||"").toLowerCase()) ||
        !["owned","licensed","public domain","cleared"].includes(String(asset.rights_status||"").toLowerCase()))
      return false;
    if (scene.media === "clip" && asset.media_kind !== "video") return false;
    if (scene.media === "still" && asset.media_kind === "video") return false;
    return true;
  }
  function credibleMatches(scene, rows) {
    const requirement = String(scene.visual||"").toLowerCase();
    const terms = keyTerms(scene.visual);
    const mustTime = [
      ["sunrise",["sunrise","dawn","daybreak","morning"]],
      ["sunset",["sunset","dusk","twilight","evening"]],
      ["night",["night","nighttime","after dark"]],
      ["pre-dawn",["dawn","predawn","blue hour","morning"]]
    ].filter(([token])=>requirement.includes(token)).map(([,valid])=>valid);
    return rows.filter(asset=>eligibility(scene,asset)).map(asset=>{
      const metadata=[asset.name,asset.description,asset.location].filter(Boolean).join(" ").toLowerCase();
      if (mustTime.some(group=>!group.some(x=>metadata.includes(x)))) return null;
      if (requirement.includes("sunrise") && /noon|midday|afternoon|sunset/.test(metadata)) return null;
      if (requirement.includes("empty") && /crowded|busy|packed/.test(metadata)) return null;
      const hits=terms.filter(term=>metadata.includes(term));
      if (hits.length<Math.min(2,terms.length)) return null;
      return {...asset,score:hits.length,reason:"Matched: "+hits.slice(0,3).join(", "),
        confidence:hits.length>=3?"Strong keywords":"Review composition"};
    }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,3);
  }
  async function findSceneAssets(index, search=null, browse=false) {
    const scene=current.story.scenes[index];
    const query=search===null?keyTerms(scene.visual).slice(0,6).join(" "):String(search||"").trim();
    const route="/api/library?profile="+encodeURIComponent(assertProfile())+"&limit=50"+
      (query?"&q="+encodeURIComponent(query):"");
    const result=await call(route);
    if (!Array.isArray(result.records)) throw new Error("Asset Manager catalog unavailable");
    return browse ? result.records.filter(row=>eligibility(scene,row)).slice(0,50)
      .map(row=>({...row,reason:"Browse result; manually verify visual"})) :
      credibleMatches(scene,result.records);
  }
  function discoverScene(index) {
    if (current.attempted.has(index)) return;
    const original=current.story;
    current.attempted.add(index);
    findSceneAssets(index).then(rows=>{
      if(current.story!==original)return;
      current.candidates[index]=rows;
      const shot=current.story.scenes[index];
      shot.candidate_assets=rows.map(a=>({id:a.id,reason:a.reason}));
      if (rows.length && !shot.candidate_asset_id) shot.candidate_asset_id=rows[0].id;
      render();
    }).catch(err=>{
      if(current.story!==original)return;
      current.candidates[index]=[];
      report("Scene "+(index+1)+" search failed: "+err.message,true);render();
    });
  }
  async function selectSceneAsset(index, asset) {
    if(current.busy)return;
    if(!eligibility(current.story.scenes[index],asset))
      throw new Error("Media type, ownership, rights or Drive availability is not eligible.");
    const shot=current.story.scenes[index],prior=JSON.parse(JSON.stringify(shot));
    shot.assigned_asset_id=asset.id;shot.selected_approved=true;shot.decision="library";shot.media_override=false;
    current.selectedAssetNames[asset.id] = String(asset.name || asset.filename || asset.title || "").trim();
    try {await save();render();report("Scene "+(index+1)+" selection verified and saved.");}
    catch(err){Object.assign(shot,prior);render();throw err;}
  }
  async function uploadScene(index, file) {
    if(!file||current.busy)return;
    if(!/^image\/|^video\//.test(file.type))throw new Error("Select a supported image or video clip.");
    if(file.size>95*1024*1024)throw new Error("For large clips, use Save & Open Asset Manager.");
    await save();
    current.busy=true;current.pendingUpload[index]="Starting upload…";render();
    try {
      const form=new FormData();
      form.append("content_profile_id",assertProfile());form.append("files",file,file.name);
      form.append("batch_name",(current.title+" Scene "+(index+1)).slice(0,110));
      form.append("description",current.story.scenes[index].visual);
      const result=await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();
        xhr.open("POST",root+"/api/library?profile="+encodeURIComponent(assertProfile()),true);
        xhr.withCredentials=true;
        xhr.upload.onprogress=e=>{if(e.lengthComputable){
          current.pendingUpload[index]=file.name+" · "+Math.round(e.loaded*100/e.total)+"% transferred";
          render();
        }};
        xhr.onerror=()=>reject(new Error("Upload interrupted; nothing was assigned."));
        xhr.onabort=()=>reject(new Error("Upload cancelled; nothing was assigned."));
        xhr.onload=()=>{
          let data={};try{data=JSON.parse(xhr.responseText)}catch{}
          if(xhr.status>=200&&xhr.status<300&&data.ok!==false)resolve(data);
          else reject(new Error(data.error||"Asset Manager upload failed ("+xhr.status+")"));
        };
        xhr.send(form);
      });
      const asset=result.records?.[0];
      if(!isId(asset?.id)||asset.content_profile_id!==assertProfile())
        throw new Error("Upload registered without a verified profile. Find it through Choose Existing Asset.");
      current.candidates[index]=[asset];current.attempted.add(index);
      report("Upload registered. Preview and select "+asset.name+" for this scene.");
    }finally{current.pendingUpload[index]="";current.busy=false;render();}
  }
  function render() {
    const workspace = $("storyFirstWorkspace");
    workspace.hidden = !current.story;
    if (!current.story) return;
    $("storyFirstTitle").value=current.title;
    $("storyFirstSummary").value=current.summary;
    const scenes=current.story.scenes;
    const selected=scenes.filter(row=>row.selected_approved===true && isId(row.assigned_asset_id)).length;
    $("storyFirstProgress").textContent=selected+" of "+scenes.length+
      " scenes have selected media — "+(scenes.length-selected)+" still need attention.";
    const handoff=$("storyFirstProduction");
    if(handoff){handoff.hidden=selected!==scenes.length;handoff.disabled=selected!==scenes.length;
      handoff.title=handoff.disabled?"Select verified media for every scene":"Create editable Production draft";}
    const list=$("storyFirstShots");
    list.replaceChildren();
    function previewAsset(parent, asset, text) {
      const wrap=node("div","story-first-candidate");
      const img=node("img","story-first-candidate-img");
      img.src=root+"/api/media-assets/"+encodeURIComponent(asset.id)+"/preview";
      img.loading="lazy";img.alt="Library preview for "+String(asset.name||"media");
      const desc=node("div","story-first-candidate-desc");
      put(desc,node("strong","",asset.name||"Asset"),
        node("small","",asset.media_kind==="video"?"Video clip":"Still image"));
      if(asset.reason)put(desc,node("small","",asset.reason));
      if(text)put(desc,node("small","",text));
      const open=node("a","story-first-preview","View preview");
      open.href=img.src;open.target="_blank";open.rel="noopener noreferrer";
      put(desc,open);
      button("Select","secondary-button",()=>selectSceneAsset(asset._index,asset).catch(e=>report(e.message,true)),desc);
      put(wrap,img,desc);parent.appendChild(wrap);
    }
    // All editorial controls remain the same inputs and save to the same Airtable storyboard.
    // Only their presentation changes: a compact icon/label column with a full-width editor.
    function sceneIcon(kind) {
      const ns="http://www.w3.org/2000/svg";
      const svg=document.createElementNS(ns,"svg");
      svg.setAttribute("viewBox","0 0 24 24");
      svg.setAttribute("fill","none");
      svg.setAttribute("stroke","currentColor");
      svg.setAttribute("stroke-width","1.8");
      svg.setAttribute("stroke-linecap","round");
      svg.setAttribute("stroke-linejoin","round");
      svg.setAttribute("aria-hidden","true");
      svg.classList.add("story-first-field-icon");
      // Desktop mouse hover has a native SVG tooltip; on touch, the
      // adjacent visible field label provides the same meaning.
      const help={
        timing:"Scene timing: the start and end of this shot, in seconds.",
        visual:"Required visual: the shot this story needs, independent of the media library.",
        voice:"Voiceover: the narration spoken during this shot.",
        media:"Preferred media: choose a still image or a real video clip.",
        sourcing:"Media sourcing: choose library media, AI imagery, or your own upload."
      };
      const title=document.createElementNS(ns,"title");
      title.textContent=help[kind]||"Scene field";
      svg.appendChild(title);
      const shapes={
        timing:[["circle",{cx:"12",cy:"12",r:"9"}],["path",{d:"M12 7v5l3 2"}]],
        visual:[["rect",{x:"3",y:"3",width:"18",height:"18",rx:"2"}],["circle",{cx:"8.5",cy:"8.5",r:"1.5"}],["path",{d:"m21 15-5-5L5 21"}]],
        voice:[["rect",{x:"9",y:"2",width:"6",height:"12",rx:"3"}],["path",{d:"M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"}]],
        media:[["path",{d:"m12 2 9 5-9 5-9-5 9-5M3 12l9 5 9-5M3 17l9 5 9-5"}]],
        sourcing:[["rect",{x:"3",y:"4",width:"18",height:"16",rx:"2"}],["path",{d:"M3 10h18m-12 0v10"}]],
      };
      (shapes[kind]||shapes.visual).forEach(([tag,attributes])=>{
        const item=document.createElementNS(ns,tag);
        Object.entries(attributes).forEach(([key,value])=>item.setAttribute(key,value));
        svg.appendChild(item);
      });
      return svg;
    }
    function sceneField(parent,kind,title,value,type="textarea") {
      const field=label(parent,title,value,type);
      const row=field.parentElement;
      row.classList.add("story-first-scene-field","story-first-scene-field--"+kind);
      row.prepend(sceneIcon(kind));
      if(kind==="visual") {
        const heading=row.querySelector("span");
        heading.textContent="Required visual";
        heading.appendChild(node("small","story-first-field-hint","Do not change just to fit library media"));
      }
      if(field.tagName==="TEXTAREA") {
        field.rows=3;
        const grow=()=>{
          field.style.height="auto";
          field.style.height=Math.min(Math.max(field.scrollHeight,88),260)+"px";
        };
        field.addEventListener("input",grow);
      }
      return field;
    }
    scenes.forEach((shot,index)=>{
      const card=node("article","story-first-shot");
      const statusText=shot.selected_approved&&isId(shot.assigned_asset_id)?"Media Selected":
        current.pendingUpload[index]?"Uploading Media":
        shot.generated_master_id?"Awaiting Image Review":
        shot.decision==="capture"?"Awaiting Your Media":
        current.candidates[index]?.length?"Candidates Available":
        shot.decision==="ai"?"Awaiting AI Generation":"Missing Media";
      const statusClass=shot.selected_approved&&isId(shot.assigned_asset_id)?"is-ready":
        current.pendingUpload[index]?"is-uploading":
        shot.generated_master_id?"is-review":
        current.candidates[index]?.length?"is-candidates":"is-pending";
      const hero=node("div","story-first-shot-hero");
      const thumb=node("div","story-first-shot-thumbnail");
      let previewUrl="",previewNote="Visual not selected";
      if(shot.selected_approved&&isId(shot.assigned_asset_id)) {
        previewUrl=root+"/api/media-assets/"+encodeURIComponent(shot.assigned_asset_id)+"/preview";
        previewNote="Selected scene media";
      }else if(shot.generated_master_id&&!shot.rejected_ai_ids?.includes(shot.generated_master_id)){
        previewUrl=root+sceneUrl(index,"preview/"+encodeURIComponent(shot.generated_master_id));
        previewNote="AI image · awaiting review";
      }else if(current.candidates[index]?.[0]?.id) {
        previewUrl=root+"/api/media-assets/"+encodeURIComponent(current.candidates[index][0].id)+"/preview";
        previewNote="Library suggestion · not selected";
      }
      if(previewUrl){
        const preview=node("img","story-first-shot-thumbnail-image");
        preview.src=previewUrl;preview.loading="lazy";preview.alt=previewNote;
        preview.onerror=()=>{preview.remove();thumb.classList.add("story-first-shot-thumbnail--empty");};
        thumb.appendChild(preview);
      }else{
        thumb.classList.add("story-first-shot-thumbnail--empty");
      }
      thumb.appendChild(node("span","story-first-thumbnail-note",previewNote));
      const heroCopy=node("div","story-first-shot-hero-copy");
      const topLine=node("div","story-first-shot-title-line");
      const title=node("h3","story-first-shot-title","Scene "+(index+1));
      const timeBadge=node("span","story-first-time-pill",clock(shot.time));
      put(topLine,title,timeBadge);
      const statusBadge=node("span","story-first-status-chip "+statusClass,statusText);
      statusBadge.setAttribute("role","status");
      put(heroCopy,topLine,statusBadge);
      put(hero,thumb,heroCopy);
      card.appendChild(hero);
      const time=sceneField(card,"timing","Scene timing (start-end seconds)",shot.time,"input");
      time.maxLength=24;
      time.oninput=()=>{shot.time=time.value;markEditing();};
      const visual=sceneField(card,"visual","Required visual — do not change just to fit library media",shot.visual);
      visual.maxLength=340;
      visual.oninput=()=>{shot.visual=visual.value;current.attempted.delete(index);delete current.candidates[index];markEditing();};
      const voice=sceneField(card,"voice","Voiceover / narration",shot.voiceover||"");
      voice.maxLength=380;
      voice.oninput=()=>{shot.voiceover=voice.value;markEditing();};
      const media=sceneField(card,"media","Preferred media","", "select");
      [["still","Still image"],["clip","Real video clip"],["still_or_clip","Still or clip"]]
        .forEach(([key,text])=>media.add(new Option(text,key)));
      media.value=shot.media==="video"?"clip":shot.media||"still_or_clip";
      media.addEventListener("change",()=>{shot.media=media.value;current.attempted.delete(index);
        delete current.candidates[index];render();markEditing();});
      if(shot.selected_approved && isId(shot.assigned_asset_id)){
        const selectedArea=node("div","story-first-selected");
        const chosen={id:shot.assigned_asset_id,name:"Selected media for scene "+(index+1)};
        const img=node("img","story-first-candidate-img");
        img.src=root+"/api/media-assets/"+encodeURIComponent(chosen.id)+"/preview";
        img.alt="Selected media for this scene";img.loading="lazy";
        const assetLists = [current.libraryRows, current.wideResults[index], current.candidates[index], [current.uploadedAssets[index]]];
        const selectedAsset = assetLists.flat().find(asset => asset && asset.id === chosen.id);
        const selectedName = String(selectedAsset?.name || selectedAsset?.filename || selectedAsset?.title ||
          current.selectedAssetNames[chosen.id] || shot.assigned_asset_name || "").trim();
        put(selectedArea,img,node("p","subtle","Selected Media Asset: "+(selectedName || "Selected asset")));
        button("Change selected media","secondary-button",()=>{
          shot.selected_approved=false;shot.assigned_asset_id=null;shot.assigned_asset_name="";shot.media_override=false;
          render();markEditing();
        },selectedArea);
        card.appendChild(selectedArea);
      }
      const mode=sceneField(card,"sourcing","Media sourcing","", "select");
      [["unassigned","Choose a source"],["library","Choose library asset"],
       ["ai","Generate AI Image"],["capture","I'll Supply the Media"]]
        .forEach(([key,text])=>mode.add(new Option(text,key)));
      mode.value=["library","ai","capture"].includes(shot.decision)?shot.decision:"unassigned";
      const actions=node("div","story-first-shot-detail");
      function renderAssets(area, assets, titleText) {
        area.appendChild(node("p","story-first-asset-heading",titleText));
        if(!assets?.length){area.appendChild(node("p","subtle","No credible recommendations. The required scene remains unchanged."));return;}
        assets.slice(0,3).forEach(asset=>previewAsset(area,{...asset,_index:index}));
      }
      function renderActions(){
        actions.replaceChildren();
        if(current.pendingUpload[index])actions.appendChild(node("p","story-first-upload-progress",
          current.pendingUpload[index]));
        if(shot.generated_master_id && !shot.rejected_ai_ids?.includes(shot.generated_master_id)){
          const img=node("img","story-first-generated-preview");
          img.src=root+sceneUrl(index,"preview/"+encodeURIComponent(shot.generated_master_id));
          img.alt="AI-generated scene image, awaiting explicit review";
          actions.appendChild(node("p","story-first-asset-heading","AI image awaiting your decision"));
          actions.appendChild(img);
          button("Accept Image","primary-button",()=>decideGenerated(index,"accept").catch(e=>report(e.message,true)),actions);
          button("Decline Image","secondary-button",()=>decideGenerated(index,"decline").catch(e=>report(e.message,true)),actions);
        }else if(mode.value==="ai"){
          const prompt=label(actions,"Editable AI image prompt",shot.ai_prompt||shot.visual);
          prompt.maxLength=850;prompt.rows=3;
          prompt.oninput=()=>{shot.ai_prompt=prompt.value;markEditing();};
          if(shot.media==="clip")actions.appendChild(node("p","subtle",
            "AI creates a STILL IMAGE. You must supply real video or explicitly override the clip requirement when accepting."));
          button("Generate this AI image","secondary-button",()=>generateSceneImage(index).catch(e=>report(e.message,true)),actions);
          button("I'll Supply the Media","secondary-button",()=>{
            shot.decision="capture";mode.value="capture";renderActions();markEditing();
          },actions);
        }else if(mode.value==="capture"){
          const capture=label(actions,"My photography / footage instructions",shot.capture_note||shot.visual);
          capture.maxLength=450;
          capture.oninput=()=>{shot.capture_note=capture.value;markEditing();};
          actions.appendChild(node("p","subtle","Awaiting Your Media. You can leave and return to the saved storyboard."));
          button("Generate Again","secondary-button",()=>{
            shot.decision="ai";mode.value="ai";renderActions();markEditing();
          },actions);
        }else if(!shot.selected_approved){
          actions.appendChild(node("p","subtle","Media needed for this scene. Studio will not substitute an unrelated image."));
          button("Generate AI Image","secondary-button",()=>{
            shot.decision="ai";mode.value="ai";renderActions();markEditing();
          },actions);
          button("I'll Supply the Media","secondary-button",()=>{
            shot.decision="capture";mode.value="capture";renderActions();markEditing();
          },actions);
        }
        const libraryArea=node("div","story-first-library-results");
        const recommendations=current.candidates[index];
        if(recommendations===undefined){
          libraryArea.appendChild(node("p","subtle","Searching the profile library for scene-specific matches…"));
        }else{
          renderAssets(libraryArea,recommendations,"Available library matches (up to 3)");
        }
        actions.appendChild(libraryArea);
        button("Choose Existing Asset","secondary-button",()=>{
          const browse=node("div","story-first-browse");
          const search=label(browse,"Search eligible assets in this profile","","input");
          search.placeholder="Name or location; leave blank to browse";
          const results=node("div","story-first-browse-results");
          button("Search Library","secondary-button",async()=>{
            results.replaceChildren(node("p","subtle","Searching…"));
            try{
              const matches=await findSceneAssets(index,search.value,true);
              results.replaceChildren();
              if(!matches.length){results.appendChild(node("p","subtle","No eligible assets found."));return;}
              results.appendChild(node("p","subtle",matches.length+" eligible library result(s) — manually verify the visual before selecting."));
              matches.forEach(asset=>previewAsset(results,{...asset,_index:index}));
            }catch(e){results.replaceChildren(node("p","form-message error-text",e.message));}
          },browse);
          browse.appendChild(results);
          libraryArea.appendChild(browse);
        },actions);
        const upload=node("input");
        upload.type="file";upload.accept=shot.media==="clip"?"video/*,.mp4,.mov,.m4v":
          shot.media==="still"?"image/*,.heic,.heif": "image/*,video/*,.heic,.heif,.mp4,.mov";
        upload.hidden=true;
        upload.addEventListener("change",()=>uploadScene(index,upload.files?.[0]).catch(e=>report(e.message,true)));
        actions.appendChild(upload);
        button("Upload Image / Clip Here","secondary-button",()=>upload.click(),actions);
        button("Save & open Asset Manager","secondary-button",()=>openAssetManager().catch(e=>report(e.message,true)),actions);
      }
      mode.addEventListener("change",()=>{shot.decision=mode.value;renderActions();markEditing();});
      card.appendChild(actions);renderActions();list.appendChild(card);
    });
    $("storyFirstSave").textContent=current.record?"Save changes to idea":"Save idea";
    scenes.forEach((_,i)=>discoverScene(i));
  }
  async function propose(e) {
    e?.preventDefault?.();
    const id = profileId();
    const prompt = String($("storyFirstBrief").value || "").trim();
    if (!isId(id)) throw new Error("Choose a city profile first.");
    if (prompt.length < 12) throw new Error("Describe the story to create, not just a location.");
    report("Writing the story first, before checking available assets…");
    $("storyFirstPropose").disabled = true;
    try {
      const proposal = await call("/api/scripted-short/propose?profile=" + encodeURIComponent(id), {
        method: "POST", body: JSON.stringify({ prompt, creative_first: true, content_profile_id: id }),
      });
      const rows = proposal.timeline?.segments || [];
      if (rows.length < 2) throw new Error("The Producer did not return a complete shot list.");
      current.profile = id;
      current.record = null;
      current.title = proposal.suggested_title || "Story-first short";
      current.summary = prompt;
      current.story = {
        schema: "story-first.1", profile_id: id, target_seconds: Number(proposal.duration_seconds || 30),
        status: "awaiting_shots", publications_blocked: true,
        scenes: rows.map((r, i) => ({
          n: i + 1,
          time: Math.round(Number(r.start_seconds || 0)) + "-" + Math.round(Number(r.end_seconds || 0)),
          visual: String(r.suggested_visual || ""),
          voiceover: String(r.voiceover_text || ""),
          media: /video|footage|moving|train|drone|timelapse/i.test(String(r.suggested_visual || "")) ? "clip" : "still_or_clip",
          state: "missing", decision: "unassigned", candidate_assets: [],
          candidate_asset_id: r.candidate_asset_id || null, assigned_asset_id: null,
          selected_approved: false, rejected_ai_ids: [],
          ai_prompt: "Vertical 9:16 realistic documentary city image: " + String(r.suggested_visual || "") + ". Authentic architecture and natural light; no text or logo.",
        })),
      };
      render();
      // Per-scene discovery follows story authoring and never changes its visual requirements.
      report("Story and timed visuals written first. Review up to three recommendations per scene, or generate/supply your own. Save partial progress anytime.");
    } finally { $("storyFirstPropose").disabled = false; }
  }
  $("scriptedShortStoryFirstJump")?.addEventListener("click", () => {
    const entry = $("scriptedShortPrompt");
    if (String(entry?.value || "").trim()) $("storyFirstBrief").value = entry.value;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    $("storyFirstBrief").focus();
  });
  $("storyFirstNewForm").addEventListener("submit", e => propose(e).catch(err => report(err.message, true)));
  $("storyFirstSave").addEventListener("click", () => save().catch(err => report(err.message, true)));
  $("storyFirstRefresh").addEventListener("click", () => refresh().catch(err => report(err.message, true)));
  $("storyFirstOpenId").addEventListener("click", async () => {
    const recordId = String($("storyFirstRecordId").value || "").trim();
    if (!isId(recordId)) { report("Enter an Airtable Idea record ID beginning with rec.", true); return; }
    try {
      const id = profileId();
      const result = await call("/api/ideas/" + encodeURIComponent(recordId) + "?profile=" + encodeURIComponent(id));
      if (!result.record) throw new Error("Idea record was not returned.");
      openRecord(result.record);
    } catch (e) { report(e.message || "Could not reopen this idea.", true); }
  });
  $("storyFirstSaved").addEventListener("change", e => {
    const record = current.ideaRecords.find(row => row.id === e.target.value);
    if (record) try { openRecord(record); } catch (err) { report(err.message, true); }
  });
  $("storyFirstTitle").addEventListener("input", markEditing);
  $("storyFirstSummary").addEventListener("input", markEditing);
  const switchProfile = () => {
    const id = profileId();
    if (!isId(id) || current.profile === id) return;
    current.profile = id;
    current.record = null;
    current.story = null;
    current.selectedAssetNames = {};
    $("storyFirstWorkspace").hidden = true;
    $("storyFirstSaved").replaceChildren(new Option("Choose a saved storyboard…", ""));
    refresh().catch(e => report(e.message, true));
  };
  select?.addEventListener("change", switchProfile);
  document.querySelector('[data-page="ideas"]')?.addEventListener("click", () => {
    refresh().then(() => {
      const resume = localStorage.getItem("studio.story_first_resume." + profileId());
      const record = current.ideaRecords.find(row => row.id === resume);
      if (record && current.record?.id !== record.id) openRecord(record);
    }).catch(error => report(error.message, true));
  });
  $("storyFirstProduction")?.addEventListener("click", async () => {
    try {
      const record = await save();
      if (selectedCount() !== current.story.scenes.length) throw new Error("All scenes need selected media before Production.");
      if (!confirm("Create an editable Production Request for this completed storyboard? Rendering and publishing remain under normal review controls.")) return;
      const result = await call("/api/ideas/" + encodeURIComponent(record.id) + "/production-request?profile=" +
        encodeURIComponent(assertProfile()), {
        method: "POST", body: JSON.stringify({ content_profile_id: assertProfile(), input_kind: "story-first" }),
      });
      if (!result.record?.id && !result.production_request?.id) throw new Error("Production Request was not confirmed.");
      report("Editable Production draft created. No rendering or publishing was initiated.");
      document.querySelector('[data-page="production"]')?.click();
    } catch (error) { report(error.message, true); }
  });
  // Script a Short is the only user-facing idea-first entry point.
  // Capture before the legacy submit handler to keep all other Ideas flows unchanged.
  const originalShortForm = $("scriptedShortForm");
  if (originalShortForm) originalShortForm.addEventListener("submit", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    $("storyFirstBrief").value = String($("scriptedShortPrompt")?.value || "").trim();
    if ($("scriptedShortResult")) $("scriptedShortResult").hidden = true;
    propose().catch(error => report(error.message, true));
  }, true);
  const originalShortPanel = $("scriptedShortPanel");
  if (originalShortPanel && panel.parentElement !== originalShortPanel)
    originalShortPanel.appendChild(panel);
  $("storyFirstNewForm").hidden = true;
  if ($("scriptedShortStoryFirstJump")) $("scriptedShortStoryFirstJump").hidden = true;
  if ($("scriptedShortPropose")) $("scriptedShortPropose").textContent = "Generate Script & Storyboard";
  setInterval(switchProfile, 2500);
  switchProfile();
})();
