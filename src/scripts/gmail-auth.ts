import "dotenv/config";
import http from "node:http";
import { google } from "googleapis";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const PORT = 3456;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;

async function main(): Promise<void> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.");
    console.error("See Session 2 setup in project docs / next assistant message.");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\nOpen this URL in your browser and approve access:\n");
  console.log(authUrl);
  console.log("\nWaiting for OAuth callback...\n");

  const code = await waitForAuthCode(oauth2Client);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error("No refresh token returned. Revoke app access in Google Account settings and retry.");
    process.exit(1);
  }

  await mkdir(path.resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(
    path.resolve(process.cwd(), "data/gmail-token.json"),
    JSON.stringify(tokens, null, 2),
  );

  console.log("\nSuccess. Add this to your .env file:\n");
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("\nToken backup saved to data/gmail-token.json");
}

function waitForAuthCode(
  oauth2Client: InstanceType<typeof google.auth.OAuth2>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith("/oauth2callback")) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const url = new URL(req.url, REDIRECT_URI);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error || !code) {
          res.writeHead(400);
          res.end("Authorization failed. You can close this tab.");
          reject(new Error(error ?? "Missing authorization code"));
          server.close();
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>SAG Gmail auth complete</h1><p>You can close this tab.</p>");
        resolve(code);
        server.close();
      } catch (err) {
        reject(err);
        server.close();
      }
    });

    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Listening on ${REDIRECT_URI}`);
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
