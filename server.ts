const PORT = 3456;

const env = {
  url: process.env.ATLASSIAN_URL || "",
  email: process.env.ATLASSIAN_USERNAME || "",
  token: process.env.ATLASSIAN_API_TOKEN || "",
};

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve static files
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file("./index.html"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Serve credentials from .env
    if (url.pathname === "/api/config") {
      return Response.json({
        url: env.url,
        email: env.email,
        token: env.token,
      });
    }

    // CORS preflight — must be before proxy handler
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, x-jira-base",
        },
      });
    }

    // Proxy /jira/* → Jira API
    if (url.pathname.startsWith("/jira/")) {
      const jiraBase = (req.headers.get("x-jira-base") || env.url).replace(/\/+$/, "");
      const auth = req.headers.get("authorization") || "Basic " + btoa(env.email + ":" + env.token);

      const jiraPath = url.pathname.replace("/jira", "") + url.search;
      const jiraUrl = jiraBase + jiraPath;

      try {
        const jiraRes = await fetch(jiraUrl, {
          method: req.method,
          headers: {
            Authorization: auth,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
        });

        return new Response(jiraRes.body, {
          status: jiraRes.status,
          headers: {
            "Content-Type": jiraRes.headers.get("content-type") || "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 502 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`\n  ⚡ Jira Dashboard running at http://localhost:${PORT}`);
console.log(`  📡 Jira: ${env.url || "(not set)"}`);
console.log(`  👤 User: ${env.email || "(not set)"}\n`);
