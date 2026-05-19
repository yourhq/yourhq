const GITHUB_REPO = "yourhq/yourhq";

const ROUTE_SCRIPTS = {
  "/":        "installer/install.sh",
  "/gateway": "installer/install-gateway.sh",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const scriptPath = ROUTE_SCRIPTS[path];

    if (!scriptPath) {
      return new Response("Not found. Available: /, /gateway\n", { status: 404 });
    }

    const tag = await getLatestRelease();

    if (!tag) {
      return new Response("Could not resolve latest release", { status: 502 });
    }

    const scriptUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${tag}/${scriptPath}`;
    const res = await fetch(scriptUrl);

    if (!res.ok) {
      return new Response("Failed to fetch install script", { status: 502 });
    }

    return new Response(res.body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-yourhq-version": tag,
      },
    });
  },
};

async function getLatestRelease() {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    { headers: { "user-agent": "yourhq-install-worker" } }
  );

  if (!res.ok) return "main";

  const data = await res.json();
  return data.tag_name;
}
