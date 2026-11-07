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
  const current = { record: null, story: null, profile: "", title: "", summary: "", busy: false, ideaRecords: [], generatedAssets: {}, candidates: {}, attempted: new Set(), browsing: {}, pendingUpload: {}, libraryRows: [], wideResults: {}, uploadedAssets: {} };

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
    discoverLibrary().catch(error => report("Story reopened; library discovery failed: " + error.message, true));
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
      localStorage.setItem("studio.story_first_resume." + id, result.record.id);
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
    scene.selected_approved = true;
    scene.state = "media_approved";
    try { await save(); await reopenLatest(); }
    catch (error) { Object.assign(scene, old); render(); throw error; }
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
    $("storyFirstTitle").value = current.title;
    $("storyFirstSummary").value = current.summary;
    const scenes = current.story.scenes;
    const total = scenes.length, selected = selectedCount();
    $("storyFirstProgress").textContent = selected + " of " + total + " scenes have selected media — " +
      (total - selected) + " still need attention. Save partial progress at any time.";
    const list = $("storyFirstShots");
    list.replaceChildren();
    scenes.forEach((shot, index) => {
      const card = node("article", "story-first-shot");
      const head = node("div", "story-first-shot-head");
      put(head, node("strong", "", "Scene " + (index + 1)), node("span", "", clock(shot.time)));
      card.appendChild(head);
      put(card, node("p", "story-first-scene-status", sceneStatus(shot)));
      const time = label(card, "Timing (start-end seconds)", shot.time, "input");
      time.maxLength = 24;
      time.oninput = () => { shot.time = time.value; head.lastChild.textContent = clock(shot.time); markEditing(); };
      const visual = label(card, "Required visual — story remains authoritative", shot.visual);
      visual.maxLength = 340;
      visual.oninput = () => { shot.visual = visual.value; markEditing(); };
      const voice = label(card, "Voiceover", shot.voiceover || "");
      voice.maxLength = 380;
      voice.oninput = () => { shot.voiceover = voice.value; markEditing(); };
      const media = label(card, "Required media type", "", "select");
      [["still_or_clip", "Image or clip"], ["still", "Still image"], ["clip", "Video clip required"]]
        .forEach(pair => media.add(new Option(pair[1], pair[0])));
      media.value = shot.media === "video" ? "clip" : shot.media || "still_or_clip";
      media.onchange = () => { shot.media = media.value; markEditing(); };
      const actions = node("div", "story-first-shot-detail");
      if (shot.selected_approved && isId(shot.assigned_asset_id)) {
        put(actions, node("strong", "", "Media Selected"));
        const picture = node("img", "story-first-generated-preview");
        picture.src = root + "/api/media-assets/" + encodeURIComponent(shot.assigned_asset_id) + "/preview";
        picture.alt = "Approved media for scene " + (index + 1);
        actions.appendChild(picture);
        button("Remove Selection", "secondary-button", async () => {
          try {
            readForm();
            const old = { ...shot };
            shot.assigned_asset_id = null; shot.selected_approved = false; shot.media_override = false;
            shot.state = "missing";
            await save(); render();
          } catch (error) { report(error.message, true); }
        }, actions);
      } else if (shot.generated_master_id) {
        put(actions, node("p", "subtle", "Awaiting Image Review — no media has been selected"));
        const image = node("img", "story-first-generated-preview");
        image.src = root + "/api/story-first/ideas/" + encodeURIComponent(current.record?.id || "") +
          "/scenes/" + (index + 1) + "/preview/" + encodeURIComponent(shot.generated_master_id);
        image.alt = "Generated AI scene image awaiting review";
        actions.appendChild(image);
        if (shot.media === "clip") {
          const override = node("label", "story-first-override");
          const checkbox = node("input"); checkbox.type = "checkbox";
          put(override, checkbox, node("span", "", "Explicitly accept a still instead of video footage"));
          actions.appendChild(override);
          button("Accept Image", "primary-button",
            () => reviewImage(index, true, checkbox.checked).catch(e => report(e.message, true)), actions);
        } else {
          button("Accept Image", "primary-button", () => reviewImage(index, true).catch(e => report(e.message, true)), actions);
        }
        button("Decline Image", "secondary-button",
          () => reviewImage(index, false).catch(e => report(e.message, true)), actions);
      } else {
        const suggestedIds = (shot.candidate_assets || []).map(item => item.id);
        if (!suggestedIds.length && shot.candidate_asset_id) suggestedIds.push(shot.candidate_asset_id);
        const recommended = suggestedIds.slice(0,3).map(id => ({
          asset: current.libraryRows.find(row => row.id === id),
          reason: (shot.candidate_assets || []).find(item => item.id === id)?.reason || "Unverified candidate",
        })).filter(item => eligible(item.asset));
        if (recommended.length) {
          put(actions, node("strong", "", "Available library matches"));
          put(actions, node("p", "subtle", "Up to three suggested assets. Preview before choosing; metadata does not prove time of day or framing."));
          recommended.forEach(item => candidateCard(actions, index, item.asset, item.reason));
        } else {
          put(actions, node("p", "subtle", "Media needed for this scene — no credible candidate selected."));
        }
        const prompt = label(actions, "AI Image Prompt — edit before generation",
          shot.ai_prompt || "Realistic vertical 9:16 city photograph: " + shot.visual);
        prompt.rows = 3; prompt.maxLength = 850;
        prompt.oninput = () => { shot.ai_prompt = prompt.value; markEditing(); };
        if (shot.media === "clip") {
          put(actions, node("p", "subtle", "AI creates a STILL, not footage. Keep the clip requirement unless you explicitly approve an override."));
        }
        button((shot.rejected_ai_ids || []).length ? "Generate Again" : "Generate AI Image",
          "secondary-button", () => generateSceneImage(index).catch(e => report(e.message, true)), actions);
        button("I'll Supply the Image or Clip", "secondary-button", async () => {
          try {
            readForm();
            shot.decision = "capture"; shot.state = "awaiting_operator_upload";
            await save(); render();
          } catch (e) { report(e.message, true); }
        }, actions);
        const capture = label(actions, "My capture / upload instructions", shot.capture_note || shot.visual);
        capture.maxLength = 450;
        capture.oninput = () => { shot.capture_note = capture.value; markEditing(); };
        const upload = node("label", "secondary-button story-first-upload-label", "Upload Image / Clip Here");
        const file = node("input"); file.type = "file"; file.className = "native-file-input";
        file.accept = "image/*,video/*,.heic,.heif,.mp4,.mov";
        upload.appendChild(file); actions.appendChild(upload);
        const progress = node("p", "story-first-upload-progress");
        progress.setAttribute("role","status"); progress.setAttribute("aria-live","polite");
        actions.appendChild(progress);
        file.onchange = () => uploadFile(index, file.files?.[0], progress).catch(e => {
          progress.textContent = "Upload not completed"; report(e.message, true);
        });
        button("Save and Open Asset Manager", "secondary-button",
          () => openAssetManager().catch(e => report(e.message, true)), actions);
        const uploaded = current.uploadedAssets[index];
        if (uploaded && eligible(uploaded)) {
          put(actions, node("strong", "", "Newly uploaded — select after preview"));
          candidateCard(actions, index, uploaded);
        }
        button("Choose Existing Asset", "secondary-button",
          () => browseAssets(index).catch(e => report(e.message, true)), actions);
        if (current.wideResults[index]) {
          const query = label(actions, "Search the eligible library", "", "input");
          query.placeholder = "Asset name, subject or location";
          button("Search Library", "secondary-button",
            () => browseAssets(index, query.value).catch(e => report(e.message, true)), actions);
          const results = node("div", "story-first-browse-results");
          current.wideResults[index].slice(0,30).forEach(asset => candidateCard(results, index, asset));
          if (!current.wideResults[index].length) results.appendChild(node("p", "subtle", "No matching eligible media."));
          actions.appendChild(results);
        }
      }
      card.appendChild(actions); list.appendChild(card);
    });
    $("storyFirstSave").textContent = current.record ? "Save Idea" : "Save New Idea";
    const handoff = $("storyFirstProduction");
    if (handoff) handoff.hidden = selected !== total;
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
      await discoverLibrary().catch(error => report("Story authored; library discovery unavailable: " + error.message, true));
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
  setInterval(switchProfile, 2500);
  switchProfile();
})();
