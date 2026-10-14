(() => {
  const RECORD_ID = /^rec[A-Za-z0-9]+$/;

  function recordId(value) {
    const id = String(value || "").trim();
    return RECORD_ID.test(id) ? id : "";
  }

  function resolve(card = {}) {
    const kind = String(card.kind || "").trim().toLowerCase();
    const profileId = recordId(card.profile_id);

    // Output rows represent a specific platform deliverable. Keep them attached
    // to that deliverable even when the payload also carries its parent request.
    if (kind === "output") {
      const outputId = recordId(card.id) || recordId(card.output_record_id);
      if (outputId) return { entity: "output", id: outputId, page: "outputs", profileId };
    }

    // A production request is authoritative once one exists. In particular,
    // produce_stale requests must not fall back to their linked Idea Candidate.
    const requestId = recordId(card.production_request_id)
      || (kind === "request" ? recordId(card.id) : "");
    if (requestId) return { entity: "production_request", id: requestId, page: "content", profileId };

    const outputId = recordId(card.output_record_id)
      || (card.output_id && kind !== "request" ? recordId(card.id) : "");
    if (outputId) return { entity: "output", id: outputId, page: "outputs", profileId };

    const ideaId = recordId(card.idea_id)
      || (kind === "idea" ? recordId(card.id) : "");
    if (ideaId) return { entity: "idea", id: ideaId, page: "ideas", profileId };

    return {
      entity: "page",
      id: "",
      page: kind === "output" ? "outputs" : (kind === "idea" ? "ideas" : "content"),
      profileId,
    };
  }

  window.FactoryOpenTargets = { resolve };
})();
