/*
 * Miami Shining TikTok Authorization + Draft Upload Publisher v5.1
 * Caption diagnostics hardening
 *
 * Replaces v5.0 without changing route contracts.
 *
 * Required Worker bindings/secrets:
 *   TIKTOK_AUTH                  KV namespace binding
 *   TIKTOK_CLIENT_KEY            TikTok client key
 *   TIKTOK_CLIENT_SECRET         TikTok client secret
 *   TIKTOK_MAKE_SHARED_SECRET    Shared secret used by Make
 *   TIKTOK_OAUTH_STATE_SECRET    Long random secret used to sign OAuth state
 *
 * Optional variables:
 *   TIKTOK_REVIEW_VIDEO_URL
 *   TIKTOK_REVIEW_VIDEO_TITLE
 *
 * v5.1 change:
 *   Photo-draft initialization now returns durable runtime evidence of the
 *   exact title/description submitted to TikTok, including Unicode lengths,
 *   request-body SHA-256, TikTok log_id, and worker version. TTD1 already
 *   stores the worker response in TikTok_Draft_Response_JSON, so this evidence
 *   is retained without changing the TTD1 request contract.
 */

const WORKER_VERSION = "v5.1-tiktok-caption-diagnostics";

const REDIRECT_URI =
  "https://auth-miami.chicagoshining.com/tiktok/callback";

const REVIEW_PAGE_URL =
  "https://www.chicagoshining.com/creator-studio/tiktok-review/";

const ALLOWED_WEB_ORIGINS = new Set([
  "https://www.chicagoshining.com",
  "https://chicagoshining.com",
]);

const AUTH_URL =
  "https://www.tiktok.com/v2/auth/authorize/";

const TOKEN_URL =
  "https://open.tiktokapis.com/v2/oauth/token/";

const REVOKE_URL =
  "https://open.tiktokapis.com/v2/oauth/revoke/";

const CREATOR_INFO_URL =
  "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";

const DIRECT_POST_URL =
  "https://open.tiktokapis.com/v2/post/publish/video/init/";

const DRAFT_VIDEO_INIT_URL =
  "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";

const DRAFT_PHOTO_INIT_URL =
  "https://open.tiktokapis.com/v2/post/publish/content/init/";

const PUBLISH_STATUS_URL =
  "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

const TOKEN_KEY = "tiktok:tokens";
const CREATOR_KEY = "tiktok:creator";
const STATE_PREFIX = "tiktok:oauth-state:";
const PIPELINE_REVIEW_PREFIX = "tiktok:pipeline-review:";
const PIPELINE_REVIEW_TTL_SECONDS = 60 * 60 * 24;

const STATE_TTL_SECONDS = 600;
const WEB_SESSION_TTL_SECONDS = 60 * 60 * 8;
const REFRESH_EARLY_MS = 10 * 60 * 1000;

const DEFAULT_REVIEW_VIDEO_URL =
  "https://media.chicagoshining.com/tiktok-review-demo.mp4";

const DEFAULT_REVIEW_VIDEO_TITLE =
  "Chicago Riverwalk Sandbox Demo";

export default {
  async fetch(request, env) {
    try {
      assertBindings(env);

      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return handleCorsPreflight(request);
      }

      if (request.method === "GET" && url.pathname === "/") {
        return homePage(env);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/health"
      ) {
        return json({
          ok: true,
          service: "chicagoshining-tiktok-auth-miami",
          version: WORKER_VERSION,
          diagnostics: {
            photo_caption_submission_evidence: true,
            request_body_sha256: true,
            tiktok_log_id: true,
          },
          pipeline_review_routes: {
            create: "POST /tiktok/review/create",
            review_page: "GET /tiktok/review?token=...",
            submit: "POST /tiktok/review/submit",
            status: "POST /tiktok/review/status",
          },
          draft_routes: {
            photo_init: "POST /tiktok/draft/photo/init",
            video_init: "POST /tiktok/draft/video/init",
            status: "POST /tiktok/draft/status",
          },
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/tiktok/connect"
      ) {
        return startOAuth(env);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/tiktok/callback"
      ) {
        return handleCallback(url, env);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/tiktok/status"
      ) {
        return publicStatus(env);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/tiktok/review/debug"
      ) {
        return browserDebug(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/review/create"
      ) {
        requirePipelineSecret(request, env);
        return createPipelineReview(request, env);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/tiktok/review"
      ) {
        return renderPipelineReviewPage(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/review/submit"
      ) {
        return submitPipelineReview(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/review/status"
      ) {
        requirePipelineSecret(request, env);
        return getPipelineReviewStatus(request, env);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/tiktok/review/session"
      ) {
        return browserSession(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/review/publish"
      ) {
        return browserPublish(request, env);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/tiktok/review/status"
      ) {
        return browserPublishStatus(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/creator-info"
      ) {
        requirePipelineSecret(request, env);
        const creator = await fetchCreatorInfo(env);
        return json({
          ok: true,
          ...creator,
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/draft/photo/init"
      ) {
        requirePipelineSecret(request, env);
        return initializePhotoDraft(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/draft/video/init"
      ) {
        requirePipelineSecret(request, env);
        return initializeVideoDraft(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/draft/status"
      ) {
        requirePipelineSecret(request, env);
        return getDraftStatus(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/publish-private"
      ) {
        requirePipelineSecret(request, env);
        return publishPrivateVideo(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/publish-status"
      ) {
        requirePipelineSecret(request, env);
        return getPublishStatus(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/tiktok/disconnect"
      ) {
        requirePipelineSecret(request, env);
        return disconnect(env);
      }

      return json(
        {
          ok: false,
          error: "Not found",
        },
        404,
      );
    } catch (error) {
      console.error(error);

      const status =
        error instanceof HttpError
          ? error.status
          : 500;

      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Unexpected error",
          worker_version: WORKER_VERSION,
        },
        status,
      );
    }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function assertBindings(env) {
  const required = [
    "TIKTOK_AUTH",
    "TIKTOK_CLIENT_KEY",
    "TIKTOK_CLIENT_SECRET",
    "TIKTOK_MAKE_SHARED_SECRET",
    "TIKTOK_OAUTH_STATE_SECRET",
  ];

  for (const name of required) {
    if (!env[name]) {
      throw new Error(
        `Missing Worker binding or secret: ${name}`,
      );
    }
  }
}

async function homePage(env) {
  const tokens = await readJson(
    env.TIKTOK_AUTH,
    TOKEN_KEY,
  );

  const creator = await readJson(
    env.TIKTOK_AUTH,
    CREATOR_KEY,
  );

  const authorized = Boolean(
    tokens?.access_token &&
      tokens?.refresh_token,
  );

  return html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Miami Shining TikTok Authorization</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.5}
    .ok{color:#067647}.warn{color:#b54708}
    .button{display:inline-block;background:#111;color:#fff;padding:12px 16px;border-radius:8px;text-decoration:none}
  </style>
</head>
<body>
  <h1>Miami Shining TikTok Authorization</h1>
  <p>Status:
    <strong class="${authorized ? "ok" : "warn"}">
      ${authorized ? "Authorized" : "Not authorized"}
    </strong>
  </p>
  ${
    creator?.creator_nickname
      ? `<p>Connected creator:
          <strong>${escapeHtml(creator.creator_nickname)}</strong>
          ${
            creator.creator_username
              ? `(@${escapeHtml(stripAt(creator.creator_username))})`
              : ""
          }
        </p>`
      : ""
  }
  <p><a class="button" href="/tiktok/connect">Connect TikTok</a></p>
  <p><a href="${REVIEW_PAGE_URL}">Open Creator Studio review page</a></p>
</body>
</html>`);
}

async function startOAuth(env) {
  const state = await createState(env);

  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    response_type: "code",
    scope: "user.info.basic,video.publish,video.upload",
    redirect_uri: REDIRECT_URI,
    state,
    disable_auto_auth: "1",
  });

  return Response.redirect(
    `${AUTH_URL}?${params.toString()}`,
    302,
  );
}

async function handleCallback(url, env) {
  const oauthError =
    url.searchParams.get("error");

  if (oauthError) {
    const description =
      url.searchParams.get("error_description") ||
      "TikTok authorization was not completed.";

    return htmlResult(
      "TikTok authorization failed",
      description,
      false,
      400,
      "/tiktok/connect",
      "Try again",
    );
  }

  const code =
    url.searchParams.get("code");

  const state =
    url.searchParams.get("state");

  if (!code || !state) {
    return htmlResult(
      "TikTok callback is active",
      "No authorization code was supplied.",
      false,
      400,
      "/tiktok/connect",
      "Start TikTok connection",
    );
  }

  const stateValid =
    await validateState(state, env);

  if (!stateValid) {
    return htmlResult(
      "TikTok authorization failed",
      "The OAuth state was invalid or expired.",
      false,
      400,
      "/tiktok/connect",
      "Start again",
    );
  }

  const body = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch(
    TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body,
    },
  );

  const tokenData =
    await parseJsonResponse(response);

  if (
    !response.ok ||
    tokenData.error
  ) {
    throw new HttpError(
      response.status || 400,
      tokenData.error_description ||
        tokenData.error ||
        "TikTok token exchange failed",
    );
  }

  const stored =
    normalizeTokenResponse(tokenData);

  await env.TIKTOK_AUTH.put(
    TOKEN_KEY,
    JSON.stringify(stored),
  );

  let creator = null;

  try {
    creator =
      await fetchCreatorInfoWithToken(
        stored.access_token,
      );

    await env.TIKTOK_AUTH.put(
      CREATOR_KEY,
      JSON.stringify(creator),
    );
  } catch (error) {
    console.warn(
      "Creator info query after OAuth failed",
      error,
    );
  }

  const scopes = parseScopes(stored.scope);

  const requiredScopes = [
    "user.info.basic",
    "video.publish",
    "video.upload",
  ];

  const missingScopes =
    requiredScopes.filter(
      (scope) => !scopes.includes(scope),
    );

  if (missingScopes.length) {
    return htmlResult(
      "TikTok connected with missing permissions",
      `Missing required permission(s): ${missingScopes.join(", ")}.`,
      false,
      400,
      "/tiktok/connect",
      "Reconnect TikTok",
    );
  }

  const sessionToken =
    await createBrowserSessionToken(env);

  return new Response(null, {
    status: 302,
    headers: {
      Location:
        `${REVIEW_PAGE_URL}?review_session=${encodeURIComponent(sessionToken)}`,
      "Cache-Control": "no-store",
    },
  });
}

async function browserDebug(
  request,
  env,
) {
  const origin =
    request.headers.get("Origin");

  const cookies =
    parseCookies(
      request.headers.get("Cookie") || "",
    );

  let sessionValid = false;
  let sessionError = null;

  try {
    requireAllowedOrigin(request);
    await requireBrowserSession(request, env);
    sessionValid = true;
  } catch (error) {
    sessionError =
      error instanceof Error
        ? error.message
        : String(error);
  }

  return corsJson(
    request,
    {
      ok: sessionValid,
      origin,
      allowed_origin:
        ALLOWED_WEB_ORIGINS.has(origin),
      session_cookie_present:
        Boolean(cookies.cs_tiktok_session),
      session_header_present:
        Boolean(request.headers.get("X-Review-Session")),
      session_valid:
        sessionValid,
      session_error:
        sessionError,
      worker_version:
        WORKER_VERSION,
    },
    sessionValid ? 200 : 401,
  );
}

async function browserSession(
  request,
  env,
) {
  requireAllowedOrigin(request);

  await requireBrowserSession(
    request,
    env,
  );

  const creator =
    await fetchCreatorInfo(env);

  return corsJson(
    request,
    {
      creator_avatar_url:
        creator.creator_avatar_url ||
        null,

      creator_username:
        stripAt(
          creator.creator_username || "",
        ),

      creator_nickname:
        creator.creator_nickname ||
        "TikTok creator",

      privacy_level_options:
        Array.isArray(
          creator.privacy_level_options,
        )
          ? creator.privacy_level_options
          : ["SELF_ONLY"],

      comment_disabled:
        Boolean(
          creator.comment_disabled,
        ),

      duet_disabled:
        Boolean(
          creator.duet_disabled,
        ),

      stitch_disabled:
        Boolean(
          creator.stitch_disabled,
        ),

      max_video_post_duration_sec:
        creator.max_video_post_duration_sec ??
        null,

      video_url:
        env.TIKTOK_REVIEW_VIDEO_URL ||
        DEFAULT_REVIEW_VIDEO_URL,

      video_title:
        env.TIKTOK_REVIEW_VIDEO_TITLE ||
        DEFAULT_REVIEW_VIDEO_TITLE,

      worker_version:
        WORKER_VERSION,
    },
  );
}

async function browserPublish(
  request,
  env,
) {
  requireAllowedOrigin(request);

  await requireBrowserSession(
    request,
    env,
  );

  const input =
    await readRequestJson(request);

  if (input.consent !== true) {
    throw new HttpError(
      400,
      "Explicit creator consent is required.",
    );
  }

  const creator =
    await fetchCreatorInfo(env);

  const privacyLevel =
    String(
      input.privacy_level || "",
    ).trim();

  const privacyOptions =
    Array.isArray(
      creator.privacy_level_options,
    )
      ? creator.privacy_level_options
      : [];

  if (
    !privacyOptions.includes(
      privacyLevel,
    )
  ) {
    throw new HttpError(
      400,
      "The selected privacy level is not available for this TikTok creator.",
    );
  }

  if (
    privacyLevel !== "SELF_ONLY"
  ) {
    throw new HttpError(
      400,
      "This Sandbox proof flow only permits the 'Only me' privacy setting.",
    );
  }

  const title =
    String(
      input.caption || "",
    ).trim();

  if (!title) {
    throw new HttpError(
      400,
      "Caption is required.",
    );
  }

  if (title.length > 2200) {
    throw new HttpError(
      400,
      `Caption is too long: ${title.length}/2200`,
    );
  }

  const commercialContent =
    String(
      input.commercial_content ||
      "none",
    );

  const disclosures =
    disclosureFlags(
      commercialContent,
    );

  const sourceUrl =
    env.TIKTOK_REVIEW_VIDEO_URL ||
    DEFAULT_REVIEW_VIDEO_URL;

  validateMediaUrl(sourceUrl);

  const postBody = {
    post_info: {
      title,
      privacy_level:
        privacyLevel,

      disable_comment:
        Boolean(
          input.disable_comment,
        ) ||
        Boolean(
          creator.comment_disabled,
        ),

      disable_duet:
        Boolean(
          input.disable_duet,
        ) ||
        Boolean(
          creator.duet_disabled,
        ),

      disable_stitch:
        Boolean(
          input.disable_stitch,
        ) ||
        Boolean(
          creator.stitch_disabled,
        ),

      video_cover_timestamp_ms:
        1000,

      brand_content_toggle:
        disclosures.brand_content_toggle,

      brand_organic_toggle:
        disclosures.brand_organic_toggle,

      is_aigc: false,
    },

    source_info: {
      source: "PULL_FROM_URL",
      video_url: sourceUrl,
    },
  };

  const result =
    await initializeDirectPost(
      postBody,
      env,
    );

  return corsJson(
    request,
    {
      publish_id:
        result.data.publish_id,
      worker_version:
        WORKER_VERSION,
    },
  );
}

async function browserPublishStatus(
  request,
  env,
) {
  requireAllowedOrigin(request);

  await requireBrowserSession(
    request,
    env,
  );

  const url =
    new URL(request.url);

  const publishId =
    String(
      url.searchParams.get(
        "publish_id",
      ) || "",
    ).trim();

  validatePublishId(
    publishId,
  );

  const result =
    await fetchPublishStatus(
      publishId,
      env,
    );

  return corsJson(
    request,
    {
      status:
        result?.data?.status ||
        null,

      fail_reason:
        result?.data?.fail_reason ||
        null,

      publicly_available_post_ids:
        result?.data
          ?.publicaly_available_post_id ||
        [],

      worker_version:
        WORKER_VERSION,
    },
  );
}

async function createPipelineReview(request, env) {
  const input = await readRequestJson(request);

  const sourceUrl = String(input.source_url || "").trim();
  const title = String(input.title || "").trim();
  const outputId = String(input.output_id || "").trim();

  validateMediaUrl(sourceUrl);

  if (!title) {
    throw new HttpError(400, "title is required");
  }

  if (title.length > 2200) {
    throw new HttpError(
      400,
      `TikTok title is too long: ${title.length}/2200`,
    );
  }

  const reviewToken = randomBase64Url(32);
  const now = Date.now();
  const expiresAt = now + PIPELINE_REVIEW_TTL_SECONDS * 1000;

  const review = {
    review_status: "pending",
    source_url: sourceUrl,
    title,
    output_id: outputId || null,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
    submitted_at: null,
    privacy_level: "SELF_ONLY",
    publish_id: null,
    last_error: null,
  };

  await env.TIKTOK_AUTH.put(
    `${PIPELINE_REVIEW_PREFIX}${reviewToken}`,
    JSON.stringify(review),
    { expirationTtl: PIPELINE_REVIEW_TTL_SECONDS },
  );

  return json({
    ok: true,
    review_token: reviewToken,
    review_url:
      `https://auth-miami.chicagoshining.com/tiktok/review?token=${encodeURIComponent(reviewToken)}`,
    expires_at: review.expires_at,
    status: "pending",
    worker_version: WORKER_VERSION,
  });
}

async function getPipelineReviewRecord(token, env) {
  if (!token || token.length < 20 || token.length > 128) {
    throw new HttpError(400, "Invalid review token");
  }

  const key = `${PIPELINE_REVIEW_PREFIX}${token}`;
  const review = await readJson(env.TIKTOK_AUTH, key);

  if (!review) {
    throw new HttpError(404, "Review link is invalid or expired");
  }

  const expiresAt = Date.parse(review.expires_at || "");
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    await env.TIKTOK_AUTH.delete(key);
    throw new HttpError(410, "Review link has expired");
  }

  return { key, review };
}

async function renderPipelineReviewPage(request, env) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "").trim();

  try {
    const { review } = await getPipelineReviewRecord(token, env);
    const creator = await fetchCreatorInfo(env);

    const alreadySubmitted =
      review.review_status === "submitted" &&
      Boolean(review.publish_id);

    const disabled =
      alreadySubmitted ? "disabled" : "";

    const buttonText =
      alreadySubmitted
        ? "Already submitted privately"
        : "Confirm and publish privately";

    return pipelineReviewHtml(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>TikTok Private Review | ChicagoShining</title>
  <style>
    body{margin:0;background:#f5f6f7;color:#172b2f;font-family:Arial,sans-serif}
    main{max-width:980px;margin:36px auto;padding:0 20px}
    .card{background:#fff;border:1px solid #dfe5e7;border-radius:16px;padding:24px;box-shadow:0 12px 32px rgba(0,0,0,.06)}
    .grid{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:24px}
    video{width:100%;max-height:700px;background:#000;border-radius:12px}
    h1{margin-top:0}.muted{color:#607277}.caption{white-space:pre-wrap}
    .privacy{display:inline-block;padding:7px 11px;border-radius:999px;background:#e9f6f3;color:#12604f;font-weight:700}
    label{display:flex;gap:10px;align-items:flex-start;margin:20px 0}
    button{background:#111;color:#fff;border:0;border-radius:9px;padding:13px 18px;font-weight:700;cursor:pointer}
    button:disabled{opacity:.55;cursor:not-allowed}
    @media(max-width:760px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main>
  <div class="card">
    <h1>Review your TikTok private post</h1>
    <p class="muted">Nothing is submitted until you check the confirmation box and press the publish button.</p>
    <div class="grid">
      <div>
        <video controls playsinline preload="metadata">
          <source src="${escapeHtml(review.source_url)}" type="video/mp4">
        </video>
      </div>
      <div>
        <h2>Destination</h2>
        <p><strong>${escapeHtml(creator.creator_nickname || "TikTok creator")}</strong>
        ${creator.creator_username ? `(@${escapeHtml(stripAt(creator.creator_username))})` : ""}</p>
        <h2>Caption</h2>
        <p class="caption">${escapeHtml(review.title)}</p>
        <h2>Privacy</h2>
        <p><span class="privacy">Only me / SELF_ONLY</span></p>
        <form method="post" action="/tiktok/review/submit">
          <input type="hidden" name="review_token" value="${escapeHtml(token)}">
          <label>
            <input type="checkbox" name="consent" value="yes" required ${disabled}>
            <span>I reviewed the video, caption, destination account and privacy setting, and I explicitly authorize this private TikTok submission.</span>
          </label>
          <button type="submit" ${disabled}>${buttonText}</button>
        </form>
        ${alreadySubmitted ? `<p class="muted">Publish ID: ${escapeHtml(review.publish_id)}</p>` : ""}
      </div>
    </div>
  </div>
</main>
</body>
</html>`);
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : 500;

    return pipelineReviewHtml(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review unavailable</title></head><body style="font-family:Arial,sans-serif;max-width:720px;margin:60px auto;padding:0 20px"><h1>Review unavailable</h1><p>${escapeHtml(error instanceof Error ? error.message : "Unexpected error")}</p></body></html>`,
      status,
    );
  }
}

async function submitPipelineReview(request, env) {
  const contentType =
    request.headers.get("Content-Type") || "";

  if (
    !contentType
      .toLowerCase()
      .includes(
        "application/x-www-form-urlencoded",
      )
  ) {
    throw new HttpError(
      415,
      "Expected a form submission",
    );
  }

  const form =
    await request.formData();

  const token =
    String(
      form.get("review_token") || "",
    ).trim();

  const consent =
    String(
      form.get("consent") || "",
    ).trim();

  if (consent !== "yes") {
    throw new HttpError(
      400,
      "Explicit creator consent is required",
    );
  }

  const { key, review } =
    await getPipelineReviewRecord(
      token,
      env,
    );

  if (
    review.review_status === "submitted" &&
    review.publish_id
  ) {
    return pipelineReviewHtml(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Already submitted</title></head><body style="font-family:Arial,sans-serif;max-width:720px;margin:60px auto;padding:0 20px"><h1>Already submitted</h1><p>This private post was already submitted. Publish ID: ${escapeHtml(review.publish_id)}</p></body></html>`,
      200,
    );
  }

  const creator =
    await fetchCreatorInfo(env);

  const privacyOptions =
    Array.isArray(
      creator.privacy_level_options,
    )
      ? creator.privacy_level_options
      : [];

  if (
    !privacyOptions.includes(
      "SELF_ONLY",
    )
  ) {
    throw new HttpError(
      409,
      "TikTok did not return SELF_ONLY as an available privacy option",
    );
  }

  try {
    const result =
      await initializeDirectPost(
        {
          post_info: {
            title: review.title,
            privacy_level: "SELF_ONLY",
            disable_comment:
              Boolean(
                creator.comment_disabled,
              ),
            disable_duet: true,
            disable_stitch: true,
            video_cover_timestamp_ms:
              1000,
            brand_content_toggle:
              false,
            brand_organic_toggle:
              false,
            is_aigc: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url:
              review.source_url,
          },
        },
        env,
      );

    review.review_status =
      "submitted";

    review.publish_id =
      result.data.publish_id;

    review.submitted_at =
      new Date().toISOString();

    review.privacy_level =
      "SELF_ONLY";

    review.last_error =
      null;

    const remainingTtl =
      Math.max(
        60,
        Math.floor(
          (
            Date.parse(
              review.expires_at,
            ) -
            Date.now()
          ) / 1000,
        ),
      );

    await env.TIKTOK_AUTH.put(
      key,
      JSON.stringify(review),
      {
        expirationTtl:
          remainingTtl,
      },
    );

    return pipelineReviewHtml(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TikTok submitted</title>
<style>body{font-family:Arial,sans-serif;max-width:720px;margin:60px auto;padding:0 20px}.ok{color:#067647}</style></head>
<body><h1 class="ok">Private TikTok submission started</h1>
<p>TikTok accepted the video for processing.</p>
<p><strong>Publish ID:</strong> ${escapeHtml(review.publish_id)}</p>
<p>You may close this page and return to the MAKE-07 controller.</p></body></html>`);
  } catch (error) {
    review.last_error =
      error instanceof Error
        ? error.message
        : String(error);

    await env.TIKTOK_AUTH.put(
      key,
      JSON.stringify(review),
      {
        expirationTtl:
          Math.max(
            60,
            Math.floor(
              (
                Date.parse(
                  review.expires_at,
                ) -
                Date.now()
              ) / 1000,
            ),
          ),
      },
    );

    throw error;
  }
}

async function getPipelineReviewStatus(request, env) {
  const input =
    await readRequestJson(request);

  const token =
    String(
      input.review_token || "",
    ).trim();

  const { review } =
    await getPipelineReviewRecord(
      token,
      env,
    );

  return json({
    ok: true,
    review_status:
      review.review_status ||
      "pending",
    publish_id:
      review.publish_id ||
      null,
    privacy_level:
      review.privacy_level ||
      "SELF_ONLY",
    submitted_at:
      review.submitted_at ||
      null,
    expires_at:
      review.expires_at ||
      null,
    last_error:
      review.last_error ||
      null,
    output_id:
      review.output_id ||
      null,
    worker_version:
      WORKER_VERSION,
  });
}

function pipelineReviewHtml(
  content,
  status = 200,
) {
  return new Response(
    content,
    {
      status,
      headers: {
        "Content-Type":
          "text/html; charset=UTF-8",
        "Cache-Control":
          "no-store, max-age=0",
        "Pragma":
          "no-cache",
        "Referrer-Policy":
          "no-referrer",
        "X-Content-Type-Options":
          "nosniff",
        "X-Frame-Options":
          "DENY",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; media-src https://media.chicagoshining.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}

async function publicStatus(env) {
  const tokens =
    await readJson(
      env.TIKTOK_AUTH,
      TOKEN_KEY,
    );

  const creator =
    await readJson(
      env.TIKTOK_AUTH,
      CREATOR_KEY,
    );

  const scopes =
    parseScopes(
      tokens?.scope || "",
    );

  return json({
    ok: true,

    authorized:
      Boolean(
        tokens?.access_token &&
        tokens?.refresh_token,
      ),

    required_scopes_granted:
      [
        "user.info.basic",
        "video.publish",
        "video.upload",
      ].every(
        (scope) =>
          scopes.includes(scope),
      ),

    access_token_expires_at:
      tokens
        ?.access_token_expires_at ||
      null,

    creator_username:
      creator
        ?.creator_username ||
      null,

    creator_nickname:
      creator
        ?.creator_nickname ||
      null,

    worker_version:
      WORKER_VERSION,
  });
}

async function fetchCreatorInfo(env) {
  const accessToken =
    await getValidAccessToken(env);

  const creator =
    await fetchCreatorInfoWithToken(
      accessToken,
    );

  await env.TIKTOK_AUTH.put(
    CREATOR_KEY,
    JSON.stringify(creator),
  );

  return creator;
}

async function fetchCreatorInfoWithToken(
  accessToken,
) {
  const response =
    await fetch(
      CREATOR_INFO_URL,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json; charset=UTF-8",
        },

        body:
          JSON.stringify({}),
      },
    );

  const data =
    await parseJsonResponse(
      response,
    );

  if (
    !response.ok ||
    data?.error?.code !== "ok"
  ) {
    throw new HttpError(
      response.status || 400,
      data?.error?.message ||
        data?.error?.code ||
        "Creator info query failed",
    );
  }

  return data.data;
}

async function getValidAccessToken(env) {
  let tokens =
    await readJson(
      env.TIKTOK_AUTH,
      TOKEN_KEY,
    );

  if (!tokens?.refresh_token) {
    throw new HttpError(
      401,
      "TikTok is not authorized. Connect TikTok first.",
    );
  }

  const expiresAt =
    Date.parse(
      tokens
        .access_token_expires_at ||
      "",
    );

  if (
    tokens.access_token &&
    Number.isFinite(
      expiresAt,
    ) &&
    expiresAt >
      Date.now() +
      REFRESH_EARLY_MS
  ) {
    return tokens.access_token;
  }

  const body =
    new URLSearchParams({
      client_key:
        env.TIKTOK_CLIENT_KEY,

      client_secret:
        env.TIKTOK_CLIENT_SECRET,

      grant_type:
        "refresh_token",

      refresh_token:
        tokens.refresh_token,
    });

  const response =
    await fetch(
      TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          "Cache-Control":
            "no-cache",
        },
        body,
      },
    );

  const refreshed =
    await parseJsonResponse(
      response,
    );

  if (
    !response.ok ||
    refreshed.error
  ) {
    throw new HttpError(
      response.status || 401,
      refreshed.error_description ||
        refreshed.error ||
        "TikTok token refresh failed",
    );
  }

  tokens =
    normalizeTokenResponse(
      refreshed,
      tokens.authorized_at,
    );

  await env.TIKTOK_AUTH.put(
    TOKEN_KEY,
    JSON.stringify(tokens),
  );

  return tokens.access_token;
}

/*
 * v5.1 caption diagnostic path.
 * The API contract accepted by TTD1 is unchanged.
 */
async function initializePhotoDraft(
  request,
  env,
) {
  const input =
    await readRequestJson(request);

  const title =
    String(
      input.title || "",
    ).trim();

  const description =
    String(
      input.description || "",
    ).trim();

  const titleLength =
    unicodeLength(title);

  const descriptionLength =
    unicodeLength(description);

  if (titleLength > 90) {
    throw new HttpError(
      400,
      `TikTok photo title is too long: ${titleLength}/90`,
    );
  }

  if (descriptionLength > 4000) {
    throw new HttpError(
      400,
      `TikTok photo description is too long: ${descriptionLength}/4000`,
    );
  }

  const photoImages =
    Array.isArray(
      input.photo_images,
    )
      ? input.photo_images.map(
          (value) =>
            String(
              value || "",
            ).trim(),
        )
      : [];

  if (
    photoImages.length < 1 ||
    photoImages.length > 35
  ) {
    throw new HttpError(
      400,
      "photo_images must contain between 1 and 35 URLs",
    );
  }

  for (
    const imageUrl
    of photoImages
  ) {
    validateMediaUrl(
      imageUrl,
    );
  }

  const coverIndex =
    Number.isFinite(
      Number(
        input.photo_cover_index,
      ),
    )
      ? Math.trunc(
          Number(
            input.photo_cover_index,
          ),
        )
      : 0;

  if (
    coverIndex < 0 ||
    coverIndex >=
      photoImages.length
  ) {
    throw new HttpError(
      400,
      "photo_cover_index is outside the photo_images array",
    );
  }

  const postBody = {
    post_info: {
      title,
      description,
    },

    source_info: {
      source:
        "PULL_FROM_URL",

      photo_cover_index:
        coverIndex,

      photo_images:
        photoImages,
    },

    post_mode:
      "MEDIA_UPLOAD",

    media_type:
      "PHOTO",
  };

  const serializedBody =
    JSON.stringify(
      postBody,
    );

  const requestBodySha256 =
    await sha256Hex(
      serializedBody,
    );

  const result =
    await initializeDraftRequest(
      DRAFT_PHOTO_INIT_URL,
      postBody,
      env,
      "photo draft",
    );

  const logId =
    tiktokLogId(result);

  return json({
    ok: true,

    draft_type:
      photoImages.length === 1
        ? "Single Photo"
        : "Photo Carousel",

    publish_id:
      result.data.publish_id,

    photo_count:
      photoImages.length,

    post_mode:
      "MEDIA_UPLOAD",

    media_type:
      "PHOTO",

    music_handling:
      "Manual in TikTok app",

    /*
     * Durable runtime proof for the caption defect.
     * TTD1 module 22 already stores the full worker response.
     */
    caption_diagnostic: {
      worker_version:
        WORKER_VERSION,

      submitted_to_tiktok:
        true,

      endpoint:
        DRAFT_PHOTO_INIT_URL,

      title_received:
        title,

      description_received:
        description,

      title_unicode_length:
        titleLength,

      description_unicode_length:
        descriptionLength,

      submitted_post_info: {
        title,
        description,
      },

      request_body_sha256:
        requestBodySha256,

      tiktok_log_id:
        logId,

      tiktok_error_code:
        result?.error?.code ||
        null,

      tiktok_error_message:
        result?.error?.message ||
        null,

      captured_at:
        new Date().toISOString(),
    },

    tiktok_response:
      result,
  });
}

async function initializeVideoDraft(
  request,
  env,
) {
  const input =
    await readRequestJson(request);

  const sourceUrl =
    String(
      input.source_url || "",
    ).trim();

  validateMediaUrl(
    sourceUrl,
  );

  const result =
    await initializeDraftRequest(
      DRAFT_VIDEO_INIT_URL,
      {
        source_info: {
          source:
            "PULL_FROM_URL",

          video_url:
            sourceUrl,
        },
      },
      env,
      "video draft",
    );

  return json({
    ok: true,

    draft_type:
      "Video",

    publish_id:
      result.data.publish_id,

    source:
      "PULL_FROM_URL",

    music_handling:
      "Manual in TikTok app",

    worker_version:
      WORKER_VERSION,

    tiktok_response:
      result,
  });
}

async function initializeDraftRequest(
  endpoint,
  body,
  env,
  label,
) {
  const accessToken =
    await getValidAccessToken(env);

  const response =
    await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json; charset=UTF-8",
        },

        body:
          JSON.stringify(
            body,
          ),
      },
    );

  const result =
    await parseJsonResponse(
      response,
    );

  const errorCode =
    result?.error?.code ||
    "";

  if (
    !response.ok ||
    errorCode !== "ok" ||
    !result?.data?.publish_id
  ) {
    const errorMessage =
      result?.error?.message ||
      `TikTok ${label} initialization failed`;

    const logId =
      tiktokLogId(result);

    throw new HttpError(
      response.status || 400,
      [
        `TikTok ${label} failed [${errorCode || "unknown"}]`,
        errorMessage,
        logId
          ? `Log ID: ${logId}`
          : "",
      ]
        .filter(Boolean)
        .join(" — "),
    );
  }

  return result;
}

async function getDraftStatus(
  request,
  env,
) {
  const input =
    await readRequestJson(request);

  const publishId =
    String(
      input.publish_id || "",
    ).trim();

  validatePublishId(
    publishId,
  );

  const result =
    await fetchPublishStatus(
      publishId,
      env,
    );

  return json({
    ok: true,

    publish_id:
      publishId,

    status:
      result?.data?.status ||
      null,

    fail_reason:
      result?.data
        ?.fail_reason ||
      null,

    downloaded_bytes:
      result?.data
        ?.downloaded_bytes ??
      null,

    uploaded_bytes:
      result?.data
        ?.uploaded_bytes ??
      null,

    publicly_available_post_ids:
      result?.data
        ?.publicaly_available_post_id ||
      [],

    draft_delivered:
      result?.data?.status ===
      "SEND_TO_USER_INBOX",

    user_completed_post:
      result?.data?.status ===
      "PUBLISH_COMPLETE",

    worker_version:
      WORKER_VERSION,

    tiktok_response:
      result,
  });
}

function unicodeLength(value) {
  return Array.from(
    String(value || ""),
  ).length;
}

async function publishPrivateVideo(
  request,
  env,
) {
  const input =
    await readRequestJson(request);

  const sourceUrl =
    String(
      input.source_url || "",
    ).trim();

  const title =
    String(
      input.title || "",
    ).trim();

  validateMediaUrl(
    sourceUrl,
  );

  if (!title) {
    throw new HttpError(
      400,
      "title is required",
    );
  }

  if (
    title.length > 2200
  ) {
    throw new HttpError(
      400,
      `TikTok title is too long: ${title.length}/2200`,
    );
  }

  const creator =
    await fetchCreatorInfo(env);

  const privacyOptions =
    Array.isArray(
      creator
        .privacy_level_options,
    )
      ? creator
          .privacy_level_options
      : [];

  const requestedPrivacy =
    String(
      input.privacy_level ||
      "SELF_ONLY",
    ).trim();

  const supportedPrivacyLevels =
    [
      "PUBLIC_TO_EVERYONE",
      "FOLLOWER_OF_CREATOR",
      "MUTUAL_FOLLOW_FRIENDS",
      "SELF_ONLY",
    ];

  if (
    !supportedPrivacyLevels.includes(
      requestedPrivacy,
    )
  ) {
    throw new HttpError(
      400,
      `Unsupported privacy_level: ${requestedPrivacy}`,
    );
  }

  if (
    !privacyOptions.includes(
      requestedPrivacy,
    )
  ) {
    throw new HttpError(
      409,
      `TikTok did not return ${requestedPrivacy} as an available privacy option for this account.`,
    );
  }

  const requestedDuration =
    Number(
      input.video_duration_sec,
    );

  const maxDuration =
    Number(
      creator
        .max_video_post_duration_sec,
    );

  if (
    Number.isFinite(
      requestedDuration,
    ) &&
    Number.isFinite(
      maxDuration,
    ) &&
    requestedDuration >
      maxDuration
  ) {
    throw new HttpError(
      400,
      `Video duration ${requestedDuration}s exceeds the creator limit of ${maxDuration}s`,
    );
  }

  const postBody = {
    post_info: {
      title,

      privacy_level:
        requestedPrivacy,

      disable_comment:
        Boolean(
          input.disable_comment,
        ) ||
        Boolean(
          creator
            .comment_disabled,
        ),

      disable_duet:
        true,

      disable_stitch:
        true,

      video_cover_timestamp_ms:
        Number.isFinite(
          Number(
            input
              .video_cover_timestamp_ms,
          ),
        )
          ? Math.max(
              0,
              Math.trunc(
                Number(
                  input
                    .video_cover_timestamp_ms,
                ),
              ),
            )
          : 1000,

      brand_content_toggle:
        Boolean(
          input
            .brand_content_toggle,
        ),

      brand_organic_toggle:
        Boolean(
          input
            .brand_organic_toggle,
        ),

      is_aigc:
        Boolean(
          input.is_aigc,
        ),
    },

    source_info: {
      source:
        "PULL_FROM_URL",

      video_url:
        sourceUrl,
    },
  };

  const result =
    await initializeDirectPost(
      postBody,
      env,
    );

  return json({
    ok: true,

    publish_id:
      result.data.publish_id,

    privacy_level:
      requestedPrivacy,

    source:
      "PULL_FROM_URL",

    creator_username:
      creator
        .creator_username ||
      null,

    creator_nickname:
      creator
        .creator_nickname ||
      null,

    worker_version:
      WORKER_VERSION,

    tiktok_response:
      result,
  });
}

async function initializeDirectPost(
  postBody,
  env,
) {
  const accessToken =
    await getValidAccessToken(env);

  const response =
    await fetch(
      DIRECT_POST_URL,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json; charset=UTF-8",
        },

        body:
          JSON.stringify(
            postBody,
          ),
      },
    );

  const result =
    await parseJsonResponse(
      response,
    );

  const errorCode =
    result?.error?.code ||
    "";

  if (
    !response.ok ||
    errorCode !== "ok" ||
    !result?.data?.publish_id
  ) {
    const errorMessage =
      result?.error?.message ||
      "TikTok Direct Post initialization failed";

    const logId =
      tiktokLogId(result);

    throw new HttpError(
      response.status || 400,
      [
        `TikTok Direct Post failed [${errorCode || "unknown"}]`,
        errorMessage,
        logId
          ? `Log ID: ${logId}`
          : "",
      ]
        .filter(Boolean)
        .join(" — "),
    );
  }

  return result;
}

async function getPublishStatus(
  request,
  env,
) {
  const input =
    await readRequestJson(request);

  const publishId =
    String(
      input.publish_id || "",
    ).trim();

  validatePublishId(
    publishId,
  );

  const result =
    await fetchPublishStatus(
      publishId,
      env,
    );

  return json({
    ok: true,

    publish_id:
      publishId,

    status:
      result?.data?.status ||
      null,

    fail_reason:
      result?.data
        ?.fail_reason ||
      null,

    publicly_available_post_ids:
      result?.data
        ?.publicaly_available_post_id ||
      [],

    worker_version:
      WORKER_VERSION,

    tiktok_response:
      result,
  });
}

async function fetchPublishStatus(
  publishId,
  env,
) {
  const accessToken =
    await getValidAccessToken(env);

  const response =
    await fetch(
      PUBLISH_STATUS_URL,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json; charset=UTF-8",
        },

        body:
          JSON.stringify({
            publish_id:
              publishId,
          }),
      },
    );

  const result =
    await parseJsonResponse(
      response,
    );

  const errorCode =
    result?.error?.code ||
    "";

  if (
    !response.ok ||
    errorCode !== "ok"
  ) {
    const errorMessage =
      result?.error?.message ||
      "TikTok publish status query failed";

    const logId =
      tiktokLogId(result);

    throw new HttpError(
      response.status || 400,
      [
        `TikTok publish status failed [${errorCode || "unknown"}]`,
        errorMessage,
        logId
          ? `Log ID: ${logId}`
          : "",
      ]
        .filter(Boolean)
        .join(" — "),
    );
  }

  return result;
}

async function disconnect(env) {
  const tokens =
    await readJson(
      env.TIKTOK_AUTH,
      TOKEN_KEY,
    );

  if (
    tokens?.access_token
  ) {
    try {
      const body =
        new URLSearchParams({
          client_key:
            env.TIKTOK_CLIENT_KEY,

          client_secret:
            env.TIKTOK_CLIENT_SECRET,

          token:
            tokens.access_token,
        });

      await fetch(
        REVOKE_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body,
        },
      );
    } catch (error) {
      console.warn(
        "TikTok revoke failed; clearing local authorization anyway",
        error,
      );
    }
  }

  await env.TIKTOK_AUTH.delete(
    TOKEN_KEY,
  );

  await env.TIKTOK_AUTH.delete(
    CREATOR_KEY,
  );

  return json({
    ok: true,
    disconnected: true,
    worker_version:
      WORKER_VERSION,
  });
}

function validateMediaUrl(value) {
  if (!value) {
    throw new HttpError(
      400,
      "source_url is required",
    );
  }

  let parsed;

  try {
    parsed =
      new URL(value);
  } catch {
    throw new HttpError(
      400,
      "source_url is not a valid URL",
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !==
      "media.chicagoshining.com"
  ) {
    throw new HttpError(
      400,
      "source_url must use HTTPS under media.chicagoshining.com",
    );
  }
}

function validatePublishId(
  publishId,
) {
  if (!publishId) {
    throw new HttpError(
      400,
      "publish_id is required",
    );
  }

  if (
    publishId.length > 64
  ) {
    throw new HttpError(
      400,
      "publish_id exceeds TikTok's 64-character maximum",
    );
  }
}

async function createState(env) {
  const timestamp =
    Math.floor(
      Date.now() / 1000,
    );

  const nonce =
    randomBase64Url(24);

  const signature =
    await hmacBase64Url(
      env.TIKTOK_OAUTH_STATE_SECRET,
      `${timestamp}.${nonce}`,
    );

  await env.TIKTOK_AUTH.put(
    `${STATE_PREFIX}${nonce}`,
    String(timestamp),
    {
      expirationTtl:
        STATE_TTL_SECONDS,
    },
  );

  return [
    timestamp,
    nonce,
    signature,
  ].join(".");
}

async function validateState(
  state,
  env,
) {
  const parts =
    String(
      state,
    ).split(".");

  if (
    parts.length !== 3
  ) {
    return false;
  }

  const [
    timestampText,
    nonce,
    signature,
  ] = parts;

  const timestamp =
    Number(
      timestampText,
    );

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    return false;
  }

  const age =
    Math.floor(
      Date.now() / 1000,
    ) -
    timestamp;

  if (
    age < 0 ||
    age >
      STATE_TTL_SECONDS
  ) {
    return false;
  }

  const expected =
    await hmacBase64Url(
      env.TIKTOK_OAUTH_STATE_SECRET,
      `${timestamp}.${nonce}`,
    );

  if (
    !timingSafeEqual(
      signature,
      expected,
    )
  ) {
    return false;
  }

  const key =
    `${STATE_PREFIX}${nonce}`;

  const stored =
    await env.TIKTOK_AUTH.get(
      key,
    );

  if (!stored) {
    return false;
  }

  await env.TIKTOK_AUTH.delete(
    key,
  );

  return true;
}

async function createBrowserSessionToken(env) {
  const issuedAt =
    Math.floor(
      Date.now() / 1000,
    );

  const nonce =
    randomBase64Url(24);

  const payload =
    `${issuedAt}.${nonce}`;

  const signature =
    await hmacBase64Url(
      env.TIKTOK_OAUTH_STATE_SECRET,
      `browser-session.${payload}`,
    );

  return `${payload}.${signature}`;
}

async function requireBrowserSession(
  request,
  env,
) {
  const cookies =
    parseCookies(
      request.headers.get(
        "Cookie",
      ) || "",
    );

  const token =
    request.headers.get(
      "X-Review-Session",
    ) ||
    cookies.cs_tiktok_session ||
    "";

  const parts =
    String(
      token,
    ).split(".");

  if (
    parts.length !== 3
  ) {
    throw new HttpError(
      401,
      "TikTok is not connected for this browser session.",
    );
  }

  const [
    issuedAtText,
    nonce,
    signature,
  ] = parts;

  const issuedAt =
    Number(
      issuedAtText,
    );

  if (
    !Number.isFinite(
      issuedAt,
    )
  ) {
    throw new HttpError(
      401,
      "The Creator Studio session is invalid.",
    );
  }

  const age =
    Math.floor(
      Date.now() / 1000,
    ) -
    issuedAt;

  if (
    age < 0 ||
    age >
      WEB_SESSION_TTL_SECONDS
  ) {
    throw new HttpError(
      401,
      "The Creator Studio session expired. Connect TikTok again.",
    );
  }

  const expected =
    await hmacBase64Url(
      env.TIKTOK_OAUTH_STATE_SECRET,
      `browser-session.${issuedAt}.${nonce}`,
    );

  if (
    !timingSafeEqual(
      signature,
      expected,
    )
  ) {
    throw new HttpError(
      401,
      "The Creator Studio session signature is invalid.",
    );
  }

  return true;
}

function requireAllowedOrigin(
  request,
) {
  const origin =
    request.headers.get(
      "Origin",
    );

  if (
    !origin ||
    !ALLOWED_WEB_ORIGINS.has(
      origin,
    )
  ) {
    throw new HttpError(
      403,
      "Origin is not allowed.",
    );
  }

  return origin;
}

function handleCorsPreflight(
  request,
) {
  const origin =
    request.headers.get(
      "Origin",
    );

  if (
    !origin ||
    !ALLOWED_WEB_ORIGINS.has(
      origin,
    )
  ) {
    return new Response(
      null,
      {
        status: 403,
      },
    );
  }

  return new Response(
    null,
    {
      status: 204,

      headers:
        corsHeaders(
          origin,
        ),
    },
  );
}

function corsJson(
  request,
  data,
  status = 200,
) {
  const origin =
    request.headers.get(
      "Origin",
    );

  return new Response(
    JSON.stringify(
      data,
      null,
      2,
    ),
    {
      status,

      headers: {
        ...corsHeaders(
          origin,
        ),

        "Content-Type":
          "application/json; charset=UTF-8",

        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":
      origin,

    "Access-Control-Allow-Credentials":
      "true",

    "Access-Control-Allow-Methods":
      "GET,POST,OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, X-Review-Session",

    "Vary":
      "Origin",
  };
}

function normalizeTokenResponse(
  data,
  originalAuthorizedAt = null,
) {
  const now =
    Date.now();

  const expiresIn =
    Number(
      data.expires_in,
    );

  const refreshExpiresIn =
    Number(
      data.refresh_expires_in,
    );

  return {
    access_token:
      data.access_token,

    refresh_token:
      data.refresh_token,

    open_id:
      data.open_id,

    scope:
      data.scope || "",

    token_type:
      data.token_type ||
      "Bearer",

    expires_in:
      Number.isFinite(
        expiresIn,
      )
        ? expiresIn
        : null,

    refresh_expires_in:
      Number.isFinite(
        refreshExpiresIn,
      )
        ? refreshExpiresIn
        : null,

    access_token_expires_at:
      Number.isFinite(
        expiresIn,
      )
        ? new Date(
            now +
            expiresIn *
              1000,
          ).toISOString()
        : null,

    refresh_token_expires_at:
      Number.isFinite(
        refreshExpiresIn,
      )
        ? new Date(
            now +
            refreshExpiresIn *
              1000,
          ).toISOString()
        : null,

    authorized_at:
      originalAuthorizedAt ||
      new Date(
        now,
      ).toISOString(),

    updated_at:
      new Date(
        now,
      ).toISOString(),
  };
}

function parseScopes(value) {
  return String(
    value || "",
  )
    .split(/[,\s]+/)
    .map(
      (scope) =>
        scope.trim(),
    )
    .filter(Boolean);
}

async function readRequestJson(
  request,
) {
  const contentType =
    request.headers.get(
      "Content-Type",
    ) || "";

  if (
    !contentType
      .toLowerCase()
      .includes(
        "application/json",
      )
  ) {
    throw new HttpError(
      415,
      "Content-Type must be application/json",
    );
  }

  try {
    const value =
      await request.json();

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new Error(
        "Body is not a JSON object",
      );
    }

    return value;
  } catch {
    throw new HttpError(
      400,
      "Request body must be a valid JSON object",
    );
  }
}

function requirePipelineSecret(
  request,
  env,
) {
  const supplied =
    request.headers.get(
      "X-Pipeline-Secret",
    ) || "";

  if (
    !supplied ||
    !timingSafeEqual(
      supplied,
      env
        .TIKTOK_MAKE_SHARED_SECRET,
    )
  ) {
    throw new HttpError(
      401,
      "Unauthorized",
    );
  }
}

async function readJson(
  kv,
  key,
) {
  const value =
    await kv.get(
      key,
    );

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(
      value,
    );
  } catch {
    return null;
  }
}

async function parseJsonResponse(
  response,
) {
  const text =
    await response.text();

  try {
    return text
      ? JSON.parse(text)
      : {};
  } catch {
    throw new HttpError(
      response.status || 502,
      `TikTok returned a non-JSON response: ${text.slice(0, 500)}`,
    );
  }
}

function json(
  data,
  status = 200,
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2,
    ),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",

        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}

function html(
  content,
  status = 200,
) {
  return new Response(
    content,
    {
      status,

      headers: {
        "Content-Type":
          "text/html; charset=UTF-8",

        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}

function htmlResult(
  title,
  message,
  success,
  status,
  linkUrl,
  linkLabel,
) {
  return html(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:720px;margin:60px auto;padding:0 20px;line-height:1.5}
    .ok{color:#067647}.bad{color:#b42318}
    a{color:#175cd3}
  </style>
</head>
<body>
  <h1 class="${success ? "ok" : "bad"}">${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <p><a href="${escapeHtml(linkUrl)}">${escapeHtml(linkLabel)}</a></p>
</body>
</html>`,
    status,
  );
}

function parseCookies(value) {
  const result = {};

  for (
    const part of
    String(
      value,
    ).split(";")
  ) {
    const index =
      part.indexOf("=");

    if (index < 0) {
      continue;
    }

    const key =
      part
        .slice(
          0,
          index,
        )
        .trim();

    const val =
      part
        .slice(
          index + 1,
        )
        .trim();

    if (key) {
      result[key] =
        decodeURIComponent(
          val,
        );
    }
  }

  return result;
}

function disclosureFlags(
  commercialContent,
) {
  const value =
    String(
      commercialContent || "",
    )
      .trim()
      .toLowerCase();

  return {
    brand_content_toggle:
      value === "branded" ||
      value === "brand_content" ||
      value === "both",

    brand_organic_toggle:
      value === "organic" ||
      value === "brand_organic" ||
      value === "both",
  };
}

function tiktokLogId(result) {
  return (
    result?.error?.log_id ||
    result?.error?.logid ||
    result?.log_id ||
    result?.logid ||
    null
  );
}

async function sha256Hex(value) {
  const bytes =
    new TextEncoder().encode(
      String(
        value || "",
      ),
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes,
    );

  return Array.from(
    new Uint8Array(
      digest,
    ),
  )
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(
            2,
            "0",
          ),
    )
    .join("");
}

async function hmacBase64Url(
  secret,
  value,
) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"],
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(value),
    );

  return bytesToBase64Url(
    new Uint8Array(
      signature,
    ),
  );
}

function randomBase64Url(
  length,
) {
  const bytes =
    new Uint8Array(
      length,
    );

  crypto.getRandomValues(
    bytes,
  );

  return bytesToBase64Url(
    bytes,
  );
}

function bytesToBase64Url(
  bytes,
) {
  let binary = "";

  for (
    const byte of bytes
  ) {
    binary +=
      String.fromCharCode(
        byte,
      );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function timingSafeEqual(
  a,
  b,
) {
  const left =
    String(
      a || "",
    );

  const right =
    String(
      b || "",
    );

  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  let result = 0;

  for (
    let i = 0;
    i < left.length;
    i += 1
  ) {
    result |=
      left.charCodeAt(i) ^
      right.charCodeAt(i);
  }

  return result === 0;
}

function stripAt(value) {
  return String(
    value || "",
  ).replace(/^@+/, "");
}

function escapeHtml(value) {
  return String(
    value,
  )
    .replace(
      /&/g,
      "&amp;",
    )
    .replace(
      /</g,
      "&lt;",
    )
    .replace(
      />/g,
      "&gt;",
    )
    .replace(
      /"/g,
      "&quot;",
    )
    .replace(
      /'/g,
      "&#039;",
    );
}