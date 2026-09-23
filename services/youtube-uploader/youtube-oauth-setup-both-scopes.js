const fs = require("fs");
const http = require("http");
const { URL } = require("url");

function loadEnv(path = ".env") {
  if (!fs.existsSync(path)) return {};
  const env = {};
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const clientId = env.GOOGLE_CLIENT_ID;
const clientSecret = env.GOOGLE_CLIENT_SECRET;
const redirectUri =
  env.GOOGLE_REDIRECT_URI || "http://localhost:3341/oauth2callback";

if (!clientId || !clientSecret) {
  throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
}

const scopes = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  // Required for privacy updates, scheduled publish changes, and videos.delete remediation.
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

const state = Math.random().toString(36).slice(2) + Date.now().toString(36);

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", scopes.join(" "));
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");
authUrl.searchParams.set("state", state);
authUrl.searchParams.set("include_granted_scopes", "true");

console.log("\nOpen this URL in a browser:\n");
console.log(authUrl.toString());
console.log("\nAuthorize with the Google account that owns/manages the target YouTube channel.");
console.log("Requested scopes: YouTube upload + read-only channel + YouTube Analytics access.\n");

const redirect = new URL(redirectUri);

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, redirectUri);

    if (reqUrl.pathname !== redirect.pathname) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const returnedState = reqUrl.searchParams.get("state");
    const code = reqUrl.searchParams.get("code");
    const error = reqUrl.searchParams.get("error");

    if (error) throw new Error(`OAuth error: ${error}`);
    if (returnedState !== state) throw new Error("OAuth state mismatch.");
    if (!code) throw new Error("OAuth callback did not include an authorization code.");

    const tokenBody = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    const tokenJson = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(
        `Token exchange failed ${tokenResponse.status}: ${JSON.stringify(tokenJson)}`
      );
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Authorization successful. Return to PowerShell.");

    const redacted = { ...tokenJson };
    if (redacted.refresh_token) redacted.refresh_token = `[stored in .env, length ${redacted.refresh_token.length}]`;
    if (redacted.access_token) redacted.access_token = "[redacted]";
    console.log("\nOAuth response:");
    console.log(JSON.stringify(redacted, null, 2));

    if (tokenJson.refresh_token) {
      if (String(tokenJson.refresh_token).length < 40) {
        throw new Error("Google returned a truncated refresh token; refusing to write .env.");
      }
      const envPath = ".env";
      const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
      const lines = current.split(/\r?\n/);
      let found = false;
      const next = lines.map((line) => {
        if (!line.startsWith("GOOGLE_REFRESH_TOKEN=")) return line;
        found = true;
        return "GOOGLE_REFRESH_TOKEN=" + tokenJson.refresh_token;
      });
      if (!found) next.push("GOOGLE_REFRESH_TOKEN=" + tokenJson.refresh_token);
      fs.writeFileSync(envPath, next.join("\n").replace(/\n*$/, "\n"));
      console.log("\nWrote the full GOOGLE_REFRESH_TOKEN to .env automatically.");
      console.log(`Stored refresh token length: ${tokenJson.refresh_token.length}`);
    } else {
      console.log(
        "\nWARNING: Google did not return a refresh_token. Remove this app from Google Account permissions, then rerun."
      );
    }

    console.log("\nScopes requested:");
    for (const scope of scopes) console.log(`- ${scope}`);

    server.close();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Authorization failed: ${err.message}`);
    console.error(err);
    server.close();
    process.exitCode = 1;
  }
});

server.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

server.listen(Number(redirect.port || 80), redirect.hostname, () => {
  console.log(
    `\nWaiting for OAuth callback at ${redirect.protocol}//${redirect.host}${redirect.pathname}`
  );
});
