import "server-only";
import { Octokit } from "octokit";
import type { GitHubTreeEntry, GitHubFileContent } from "./types";

const owner = process.env.GITHUB_REPO_OWNER!;
const repo = process.env.GITHUB_REPO_NAME!;

function getOctokit() {
  return new Octokit({ auth: process.env.GITHUB_TOKEN });
}

/**
 * Check if a branch exists in the repo.
 */
export async function branchExists(branch: string): Promise<boolean> {
  const octokit = getOctokit();
  try {
    await octokit.rest.repos.getBranch({ owner, repo, branch });
    return true;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "status" in e && e.status === 404) {
      return false;
    }
    throw e;
  }
}

/**
 * Create a new branch from the repo's default branch (or a specified base).
 */
export async function createBranch(
  branch: string,
  fromBranch?: string
): Promise<void> {
  const octokit = getOctokit();

  // Get the base branch SHA
  let baseBranch = fromBranch;
  if (!baseBranch) {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    baseBranch = repoData.default_branch;
  }

  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });

  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: ref.object.sha,
  });
}

/**
 * Get the full file tree for a branch.
 * Returns only files (blobs) and folders (trees).
 */
export async function getFileTree(
  branch: string
): Promise<GitHubTreeEntry[]> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "1",
  });

  return (data.tree as { path?: string; type?: string; sha?: string }[])
    .filter((item) => item.path && item.sha && (item.type === "blob" || item.type === "tree"))
    .map((item) => ({
      path: item.path!,
      type: item.type as "blob" | "tree",
      sha: item.sha!,
    }));
}

/**
 * Get the content of a single file from a branch.
 * Returns decoded content + sha (needed for updates).
 */
export async function getFileContent(
  branch: string,
  path: string
): Promise<GitHubFileContent> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  });

  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`Path "${path}" is not a file`);
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha, path };
}

/**
 * Update an existing file (commit + push).
 * Returns the new SHA of the file.
 */
export async function saveFile(
  branch: string,
  path: string,
  content: string,
  sha: string,
  message?: string
): Promise<string> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: message || `Update ${path}`,
    content: Buffer.from(content).toString("base64"),
    sha,
    branch,
  });

  return data.content?.sha ?? sha;
}

/**
 * Create a new file (commit + push).
 * Returns the SHA of the new file.
 */
export async function createFile(
  branch: string,
  path: string,
  content: string,
  message?: string
): Promise<string> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: message || `Create ${path}`,
    content: Buffer.from(content).toString("base64"),
    branch,
  });

  return data.content?.sha ?? "";
}

/**
 * Delete a file from a branch (commit + push).
 */
export async function deleteFile(
  branch: string,
  path: string,
  sha: string,
  message?: string
): Promise<void> {
  const octokit = getOctokit();
  await octokit.rest.repos.deleteFile({
    owner,
    repo,
    path,
    message: message || `Delete ${path}`,
    sha,
    branch,
  });
}

/**
 * List branches in the repo, optionally filtered by a name prefix.
 * Paginates through all results (GitHub default page size is 30).
 */
export async function listBranches(prefix?: string): Promise<string[]> {
  const octokit = getOctokit();
  const branches: string[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: perPage,
      page,
    });
    for (const b of data) {
      if (!prefix || b.name.startsWith(prefix)) branches.push(b.name);
    }
    if (data.length < perPage) break;
    page += 1;
  }

  return branches;
}

/**
 * Delete a branch. Best-effort — swallows 404 so rollback is idempotent.
 */
export async function deleteBranch(branch: string): Promise<void> {
  const octokit = getOctokit();
  try {
    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "status" in e && e.status === 404) return;
    throw e;
  }
}

/**
 * Get the repo's default branch name.
 */
export async function getDefaultBranch(): Promise<string> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}
