const BODY = [
  "User-agent: facebookexternalhit",
  "Allow: /",
  "",
  "User-agent: Facebot",
  "Allow: /",
  "",
  "User-agent: Meta-ExternalAgent",
  "Allow: /",
  "",
  "User-agent: Meta-ExternalFetcher",
  "Allow: /",
  "",
  "User-agent: *",
  "Allow: /",
  "",
].join("\n");

export default {
  async fetch() {
    return new Response(BODY, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  },
};
