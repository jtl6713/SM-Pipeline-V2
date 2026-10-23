/* Script-a-Short / Production / Factory conversation view.
 * All messages are persisted by the authenticated Production Request API.
 * The client never treats feedback as approval or automatic publication.
 */
(() => {
  const $ = id => document.getElementById(id);
  let activeRequestId = "";
  let revision = 0;
  let busy = false;
  let recognition = null;
  function setMessage(text, error = false) {
    const node = $("studioProducerChatStatus");
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("error-text", error);
  }
  const create = (name, cls = "", content = "") => {
    const el = document.createElement(name);
    if (cls) el.className = cls;
    if (content) el.textContent = content;
    return el;
  };
  async function api(path, options = {}) {
    const res = await fetch(path, {credentials:"same-origin",
      headers: {"Accept":"application/json", ...(options.body ? {"Content-Type":"application/json"} : {})},
      ...options});
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || data.message || "Producer conversation unavailable");
    return data;
  }
  function initPanel() {
    const workspace = $("productionRequestWorkspace");
    if (!workspace) return null;
    let panel = $("studioProducerChatPanel");
    if (panel) return panel;
    panel = create("section", "panel studio-producer-chat");
    panel.id = "studioProducerChatPanel";
    panel.hidden = true;
    const heading = create("div", "studio-producer-chat-heading");
    heading.append(create("h3", "", "Talk to Your Producer"));
    const refresh = create("button","secondary-button","Refresh conversation");
    refresh.type = "button";
    refresh.addEventListener("click", () => open(activeRequestId, true));
    heading.append(refresh);
    panel.append(heading);
    panel.append(create("p","subtle","Give creative direction naturally. Feedback is saved with this Production Request. Scene revisions remain proposals until validated and executed through the existing production workflow."));
    const history = create("div","studio-producer-chat-history");
    history.id = "studioProducerChatHistory";
    history.setAttribute("role","log");
    history.setAttribute("aria-label","Producer conversation history");
    panel.append(history);
    const sceneView = create("details","studio-producer-scenes");
    sceneView.id = "studioProducerSceneCoverage";
    sceneView.append(create("summary","","Current scene media and requirements"));
    sceneView.append(create("div","studio-producer-scene-list"));
    panel.append(sceneView);
    const form = create("form", "studio-producer-chat-form");
    form.id = "studioProducerChatForm";
    const label = create("label","","Describe a change");
    label.htmlFor = "studioProducerChatMessage";
    const textarea = create("textarea");
    textarea.id = "studioProducerChatMessage";
    textarea.rows = 3;
    textarea.maxLength = 3000;
    textarea.placeholder = "I like the narration, but please use sunnier clips in the second half.";
    textarea.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    form.append(label,textarea);
    const actions = create("div","studio-producer-chat-actions");
    const dictate = create("button","secondary-button","Dictate");
    dictate.type = "button";
    dictate.addEventListener("click", () => {
      const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Speech) return setMessage("Speech dictation is not available in this browser.", true);
      if (recognition) { recognition.stop(); return; }
      recognition = new Speech();
      recognition.lang = document.documentElement.lang || "en-US";
      recognition.onresult = event => {
        const spoken = [...event.results].map(row => row[0]?.transcript || "").join(" ");
        textarea.value = [textarea.value,spoken].filter(Boolean).join(" ").slice(0,3000);
      };
      recognition.onend = () => { recognition = null; };
      recognition.onerror = () => setMessage("Microphone dictation stopped; typed feedback is preserved.",true);
      try {recognition.start();} catch {recognition = null;setMessage("Microphone unavailable.",true);}
    });
    const send = create("button","primary-button","Send feedback");
    send.type = "submit";
    send.id = "studioProducerChatSend";
    actions.append(dictate,send);
    form.append(actions);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy || !activeRequestId) return;
      const message = textarea.value.trim();
      if (!message) return setMessage("Enter your creative feedback.",true);
      busy = true; send.disabled = true; setMessage("Saving your feedback…");
      try {
        const data = await api("/api/production-requests/"+encodeURIComponent(activeRequestId)+"/producer-conversation",{
          method:"POST",
          body:JSON.stringify({message,message_id:crypto.randomUUID(),expected_revision:revision}),
        });
        textarea.value = "";
        draw(data);
        setMessage(data.message || "Saved. Your proposed changes still require the normal review and Quality Agent checks.");
      } catch(error) {setMessage(error.message,true);}
      finally {busy=false;send.disabled=false;}
    });
    panel.append(form);
    const status = create("p","form-message");
    status.id = "studioProducerChatStatus";
    status.setAttribute("aria-live","polite");
    panel.append(status);
    const formHost = $("productionRequestForm");
    if (formHost) formHost.before(panel);
    else workspace.append(panel);
    return panel;
  }
  function draw(data) {
    const history = $("studioProducerChatHistory");
    if (!history) return;
    revision = Number(data.thread?.revision || 0);
    history.replaceChildren();
    const messages = data.thread?.messages || [];
    if (!messages.length) history.append(create("p","subtle","No feedback yet. Describe what you would like the Producer to change."));
    messages.forEach(message => {
      const article = create("article","studio-producer-message");
      const source = message.source === "factory" ? "Factory feedback" :
        message.role === "producer" ? "Producer" : "You";
      article.append(create("strong","",source));
      if (message.at) {
        const time = Date.parse(message.at);
        if (Number.isFinite(time)) article.append(create("small","",new Date(time).toLocaleString()));
      }
      article.append(create("p","",message.content || ""));
      const p = message.proposal;
      if (p) {
        const scope = p.target_scenes?.length ? "Scenes " + p.target_scenes.join(", ") : "Scene selection pending";
        article.append(create("small","",scope+" · Proposal only · Quality Agent and human approval required"));
        if (p.required_asset_override_blocked) article.append(create("p","error-text","Required uploaded media cannot be silently replaced."));
      }
      history.append(article);
    });
    history.scrollTop = history.scrollHeight;
    const scenes = $("studioProducerSceneCoverage")?.querySelector(".studio-producer-scene-list");
    if (scenes) {
      scenes.replaceChildren();
      const rows = data.producer_plan?.scene_order || [];
      if (!rows.length) scenes.append(create("p","subtle","Scene-level Producer Plan is not available for this request."));
      rows.forEach(row => {
        const item=create("p","","Scene "+String(row.scene||"")+" · "+String(row.status||"unassigned")+" · "+String(row.visual_requirement||"Visual requirements not specified"));
        scenes.append(item);
      });
    }
  }
  async function open(id, force = false) {
    if (!/^rec[A-Za-z0-9]+$/.test(String(id || ""))) return;
    const panel = initPanel();
    if (!panel) return;
    if (activeRequestId === id && !force && !panel.hidden) return;
    activeRequestId = id;
    panel.hidden = false;
    setMessage("Loading conversation…");
    try {
      const data = await api("/api/production-requests/"+encodeURIComponent(id)+"/producer-conversation");
      if (activeRequestId !== id) return;
      draw(data); setMessage("");
    } catch(error) {if(activeRequestId === id) setMessage(error.message,true);}
  }
  async function showFactoryHistory(id) {
    const container = $("factoryProducerTranscript");
    if (!container) return;
    container.replaceChildren(create("p","subtle","Loading previous Producer feedback…"));
    if (!/^rec[A-Za-z0-9]+$/.test(String(id||""))) return;
    try {
      const data = await api("/api/production-requests/"+encodeURIComponent(id)+"/producer-conversation");
      if ($("factoryFeedbackBackdrop")?.hidden) return;
      container.replaceChildren();
      const messages=(data.thread?.messages||[]).slice(-10);
      if (!messages.length) container.append(create("p","subtle","No earlier conversation for this request."));
      messages.forEach(row => {
        const item=create("p");
        item.append(create("strong","",row.source==="factory"?"Factory feedback: ":"You: "));
        item.append(document.createTextNode(row.content||""));
        container.append(item);
      });
    } catch(e) {container.replaceChildren(create("p","error-text",e.message));}
  }
  function initScriptedShortRevision() {
    const button = $("scriptedShortRevise");
    const prompt = $("scriptedShortPrompt");
    const form = $("scriptedShortForm");
    const field = $("scriptedShortFollowup");
    const status = $("scriptedShortRevisionStatus");
    if (!button || !prompt || !form || !field || !status) return;
    button.addEventListener("click", () => {
      if ($("scriptedShortResult")?.hidden) return;
      if ($("scriptedShortPropose")?.disabled) {
        status.textContent = "The Producer is still preparing the current proposal.";
        return;
      }
      const direction = field.value.trim();
      if (!direction) {
        status.textContent = "Describe the change you would like to make first.";
        field.focus();
        return;
      }
      const nextBrief = prompt.value.trim() + "\n\nProducer follow-up: " + direction;
      if (nextBrief.length > 5000) {
        status.textContent = "The combined brief exceeds 5,000 characters. Shorten your instructions before revising.";
        field.focus();
        return;
      }
      prompt.value = nextBrief;
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
      field.value = "";
      status.textContent = "Preparing a revised proposal with your original brief and follow-up directions. The proposal is not saved until Accept.";
      form.requestSubmit();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initScriptedShortRevision, { once: true });
  else initScriptedShortRevision();

  window.StudioProducerConversation = {open,showFactoryHistory};
})();