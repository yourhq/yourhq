# HQ Docs Site

This directory is the Mintlify source for the public HQ documentation site.

## Local Preview

Install the Mintlify CLI:

```bash
npm i -g mint
```

Run the preview from this directory:

```bash
cd docs-site
mint dev
```

## Validate

```bash
cd docs-site
node scripts/generate-llms-full.mjs
mint validate
mint broken-links
```

`llms-full.txt` is generated from the pages listed in `docs.json`. If you add or move pages, run the generator and commit the updated file.

## Deployment

Mintlify should be configured as a monorepo project with the docs path set to:

```text
/docs-site
```

Production docs are intended to live at:

```text
https://docs.yourhq.ai
```

## Contribution Rule

If a change affects setup, security, environment variables, migrations, agent behavior, gateway commands, provider auth, or public workflows, update these docs in the same PR.
