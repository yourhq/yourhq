// Server component that emits a <script> tag containing the active
// project's PUBLIC config. The client-side Supabase factory reads
// window.__HQ_CONFIG__ synchronously, avoiding the need to make every
// createClient() call async.
//
// Only the PublicProject fields are emitted. The service role key
// never reaches this component — it's guarded by the TypeScript type
// of readActiveProjectPublic()'s return value.

import { readActiveProjectPublic } from "./server";

export interface InjectedHqConfig {
  projectId: string;
  url: string;
  anonKey: string;
  label: string;
  emoji: string;
}

/**
 * Render this inside the `<head>` of the root layout. It emits a
 * globals-populating script BEFORE any client components hydrate, so
 * the synchronous `window.__HQ_CONFIG__` read never races.
 *
 * If the registry is empty (onboarding state), emits a marker that
 * the client code can check to redirect to /onboarding.
 */
export async function HqConfigScript(): Promise<React.ReactElement | null> {
  const project = await readActiveProjectPublic();

  const payload: { config: InjectedHqConfig | null } = {
    config: project
      ? {
          projectId: project.id,
          url: project.url,
          anonKey: project.anonKey,
          label: project.label,
          emoji: project.emoji,
        }
      : null,
  };

  // Next.js's JSON.stringify within a <script> tag requires escaping
  // "<" to prevent breaking out of the tag. See:
  // https://mathiasbynens.be/notes/etago
  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");

  return (
    <script
      id="hq-config"
      dangerouslySetInnerHTML={{
        __html: `window.__HQ_CONFIG__ = ${serialized}.config;`,
      }}
    />
  );
}
