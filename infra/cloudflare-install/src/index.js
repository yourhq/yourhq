const GITHUB_REPO = "yourhq/yourhq";
const SCRIPT_PATH = "installer/install.sh";

export default {
  async fetch(request, env) {
    const tag = await getLatestRelease();

    if (!tag) {
      return new Response("Could not resolve latest release", { status: 502 });
    }

    const scriptUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${tag}/${SCRIPT_PATH}`;
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
