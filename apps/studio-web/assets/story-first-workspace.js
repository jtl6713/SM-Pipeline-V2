/* Story-first storyboard workspace. All persistence is through canonical Airtable Idea routes. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const panel = $("storyFirstPanel");
  if (!panel) return;
  const config = window.CHICAGOSHINING_STUDIO_CONFIG || {};
  const root = String(config.apiBase || window.location.origin).replace(/\/$/, "");
  const select = $("studioProfileSelect");
  const status = $("storyFirstStatus");
  const current = { record: null, story: null, profile: "", title: "", summary: "", busy: false, ideaRecords: [], generatedAssets: {} };

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
    const wrap = put(parent, node("label", "story-first-field"));
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
    const voiceovers = String(record.summary || "").split(/\r?\n/).filter(line => /^\s*[1-9]\d*\.\s+/.test(line) && !/\s\u2014\s/.test(line)).map(line => line.replace(/^\s*\d+\.\s+/, "").trim());
    if (voiceovers.length === current.story.scenes.length && current.story.scenes.every(row => !row.voiceover)) {
      current.story.scenes.forEach((row, i) => { row.voiceover = voiceovers[i]; });
    }
    current.profile = id;
    current.title = String(record.title || "");
    current.summary = String(record.summary || "");
    render();
    $("storyFirstSaved").value = record.id;
    report("Reopened saved Idea " + (record.candidate_id || record.id) + ". All shot requirements and sourcing choices are preserved.");
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
        result = await call("/api/ideas/" + encodeURIComponent(current.record.id) + "?profile=" + encodeURIComponent(id), {
          method: "PATCH", body: JSON.stringify(body),
        });
      } else {
        result = await call("/api/ideas?profile=" + encodeURIComponent(id), {
          method: "POST", body: JSON.stringify({ ...body, input_kind: "story-first" }),
        });
      }
      if (!result.record?.id) throw new Error("Studio did not return the saved Idea ID.");
      current.record = result.record;
      current.story = JSON.parse(JSON.stringify(storyNotesFromRecord(result.record) || story));
      await refresh(true);
      report("Saved to Airtable · Idea " + (result.record.candidate_id || result.record.id) + ". You can leave and reopen it from Ideas.");
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
  async function generateSceneImage(index) {
    const story = readForm();
    const scene = story.scenes[index];
    if (scene?.decision !== "ai") throw new Error("Choose AI image for this shot first.");
    if (!String(scene.ai_prompt || "").trim()) throw new Error("Add a prompt for this shot.");
    if (!confirm("Generate one AI image for scene " + (index + 1) + "? It will be added to an editable Production draft, not rendered or published.")) return;
    const record = await save();
    current.busy = true;
    report("Preparing the saved Idea and generating one image for scene " + (index + 1) + "…");
    try {
      const id = assertProfile();
      const draft = await call("/api/ideas/" + encodeURIComponent(record.id) + "/production-request?profile=" + encodeURIComponent(id), {
        method: "POST", body: JSON.stringify({ content_profile_id: id }),
      });
      const requestId = String(draft.record?.id || record.production_request_id || "");
      if (!isId(requestId)) throw new Error("No editable Production draft was returned. No image was requested.");
      const generated = await call("/api/production-requests/" + encodeURIComponent(requestId) + "/generate-ai-masters?profile=" + encodeURIComponent(id), {
        method: "POST",
        body: JSON.stringify({
          add_ai_count: 1, content_profile_id: id,
          prompt_guidance: String(scene.ai_prompt).slice(0, 1800),
          asset_name_base: (current.title.slice(0, 90) + " Scene " + (index + 1)).trim(),
        }),
      });
      const aiAsset = (generated.assets || []).filter(a => String(a?.source || "").startsWith("studio_ai")).slice(-1)[0];
      if (!aiAsset?.id) throw new Error("Image generation returned no identifiable master. Check the Production draft before retrying.");
      scene.generated_master_id = aiAsset.id;
      current.generatedAssets[aiAsset.id] = aiAsset;
      current.record.production_request_id = requestId;
      render();
      await saveAfterGeneration(scene);
      report("AI image created for scene " + (index + 1) + " and saved in the Production draft. Review it before approving this shot.");
    } finally { current.busy = false; }
  }
  async function saveAfterGeneration(scene) {
    // save() is separate from the AI generation busy lease.
    current.busy = false;
    try { await save(); }
    catch (error) { report("Image created, but storyboard linking needs attention: " + error.message, true); throw error; }
  }
  function render() {
    const workspace = $("storyFirstWorkspace");
    workspace.hidden = !current.story;
    if (!current.story) return;
    $("storyFirstTitle").value = current.title;
    $("storyFirstSummary").value = current.summary;
    const scenes = current.story.scenes;
    const list = $("storyFirstShots");
    list.replaceChildren();
    const gaps = scenes.filter(row => !row.assigned_asset_id).length;
    $("storyFirstProgress").textContent = scenes.length + " story scenes · " + gaps + " awaiting verified media · render & publish locked";
    scenes.forEach((shot, index) => {
      const card = node("article", "story-first-shot");
      const head = node("div", "story-first-shot-head");
      put(head, node("strong", "", "Scene " + (index + 1)), node("span", "", clock(shot.time)));
      card.appendChild(head);
      const visual = label(card, "Required visual / clip — the story stays authoritative", shot.visual);
      visual.maxLength = 340;
      visual.oninput = () => { shot.visual = visual.value; markEditing(); };
      const voice = label(card, "Narration", shot.voiceover || "");
      voice.maxLength = 380;
      voice.oninput = () => { shot.voiceover = voice.value; markEditing(); };
      const mode = label(card, "How should we source this shot?", "", "select");
      [["unassigned", "Decide later"], ["library", "Find or review existing asset"], ["ai", "Generate AI image"], ["capture", "I'll capture or upload the media"]]
        .forEach(pair => mode.add(new Option(pair[1], pair[0])));
      mode.value = ["library", "ai", "capture"].includes(shot.decision) ? shot.decision : "unassigned";
      const actions = node("div", "story-first-shot-detail");
      function renderActions() {
        actions.replaceChildren();
        if (mode.value === "library") {
          put(actions, node("p", "subtle", "A library filename is only a candidate until reviewed. Studio will not silently substitute it for this scene."));
          const asset = label(actions, "Candidate Media Asset ID (optional)", shot.candidate_asset_id || "", "input");
          asset.maxLength = 64;
          asset.placeholder = "rec…";
          asset.oninput = () => { shot.candidate_asset_id = asset.value.trim(); markEditing(); };
          if (isId(shot.candidate_asset_id)) {
            const preview = node("a", "story-first-preview", "View library candidate");
            preview.href = root + "/api/media-assets/" + encodeURIComponent(shot.candidate_asset_id) + "/preview";
            preview.target = "_blank";
            preview.rel = "noopener noreferrer";
            actions.appendChild(preview);
          }
          button("Save & open Asset Manager", "secondary-button", () => openAssetManager().catch(e => report(e.message, true)), actions);
        } else if (mode.value === "ai") {
          const imagePrompt = label(actions, "AI image prompt — edit before generating", shot.ai_prompt || shot.visual);
          imagePrompt.maxLength = 850;
          imagePrompt.rows = 3;
          imagePrompt.oninput = () => { shot.ai_prompt = imagePrompt.value; markEditing(); };
          if (shot.generated_master_id) put(actions, node("p", "subtle", "Generated master " + shot.generated_master_id + " · review required before use."));
          const generated = current.generatedAssets[shot.generated_master_id];
          if (generated?.url) {
            const image = node("img", "story-first-generated-preview");
            image.src = generated.url;
            image.alt = "Generated scene candidate awaiting review";
            actions.appendChild(image);
          }
          button("Generate this AI image", "secondary-button", () => generateSceneImage(index).catch(e => report(e.message, true)), actions);
        } else if (mode.value === "capture") {
          const capture = label(actions, "What to photograph or film / instructions to keep", shot.capture_note || shot.visual);
          capture.maxLength = 450;
          capture.oninput = () => { shot.capture_note = capture.value; markEditing(); };
          button("Save & open Asset Manager", "secondary-button", () => openAssetManager().catch(e => report(e.message, true)), actions);
        } else {
          put(actions, node("p", "subtle", "No verified media. Choose a source now or leave this scene open."));
        }
      }
      mode.addEventListener("change", () => {
        shot.decision = mode.value;
        if (mode.value !== "ai") shot.generated_master_id = null;
        renderActions();
        markEditing();
      });
      card.appendChild(actions);
      renderActions();
      list.appendChild(card);
    });
    $("storyFirstSave").textContent = current.record ? "Save changes to idea" : "Save new idea";
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
          media: "still_or_clip", state: "missing", decision: r.candidate_asset_id ? "library" : "unassigned",
          candidate_asset_id: r.candidate_asset_id || null, assigned_asset_id: null,
          ai_prompt: "Vertical 9:16 realistic ChicagoShining editorial image: " + String(r.suggested_visual || "") + ". Authentic architecture and natural light; no text or logo.",
        })),
      };
      render();
      report("Story written. Review every shot, choose AI / library / capture, then Save idea. Nothing has been published.");
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
    $("storyFirstWorkspace").hidden = true;
    $("storyFirstSaved").replaceChildren(new Option("Choose a saved storyboard…", ""));
    refresh().catch(e => report(e.message, true));
  };
  select?.addEventListener("change", switchProfile);
  setInterval(switchProfile, 2500);
  switchProfile();
})();
