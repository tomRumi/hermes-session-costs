# Packaging

Everything needed to distribute this plugin through Hermes' own channels.

## Distribution routes

| Route | Status | Notes |
| --- | --- | --- |
| **Install link** (`hermes://`) | available immediately | No review. Users click, confirm, install. |
| **Plugin catalog** (`hermes plugins install hermes-session-costs`) | requires a reviewed PR + a 2-week-old pin | See `catalog-entry.yaml` |

## The install link

```
hermes://plugin/install?repo=tomRumi/hermes-session-costs&enable=1
```

Add `force=1` to replace an existing install. Use `hermes-dev://` on dev builds.
Deep links always show a confirmation dialog; they never auto-install.

## Submitting to the catalog

The catalog is not self-serve. It is a directory of YAML entries in the
`plugin-catalog/` folder of `NousResearch/hermes-agent`, admitted only by a
reviewed pull request. The rules (from `plugin-catalog/README.md`):

1. **Human-merged gate** — entries land only via a PR reviewed by a maintainer.
2. **Exact SHA pins are mandatory** — a full 40-character commit SHA. Branches,
   tags and short SHAs are rejected by the loader.
3. **Pin maturity** — the pinned release should be **at least 2 weeks old** at
   pin time.
4. **SHA bumps are new PRs** — updating the pin is a new, re-reviewed PR.
5. **Owner-or-major-contributor submissions only** — this repo's owner must be
   the submitter.
6. **Declared capabilities must match reality** — validated against the pinned
   commit; undeclared capability creep is treated as a security issue.

The PR's CI (`.github/workflows/plugin-catalog-ci.yml`) additionally:

- validates the entry file's schema (name/repo/sha/description/maintainer
  required; `sha` exactly 40 lowercase hex; `repo` an `https://` URL;
  `platforms` from `linux|macos|windows`; `capabilities` keys limited to
  `provides_tools|provides_hooks|provides_middleware|requires_env`);
- clones the repo, checks out the pinned SHA, requires `plugin.yaml` /
  `plugin.yml` / `plugin.json` to exist there, and runs
  `hermes plugins validate` on it.

### Step by step

```bash
# 1. Tag the release (the pin must age 2 weeks before the PR).
git tag -a v1.0.0 -m "v1.0.0" && git push origin v1.0.0

# 2. Record the commit sha for the entry.
git rev-list -n1 v1.0.0

# 3. Fork + clone hermes-agent, add the entry (2 weeks later).
#    Copy packaging/catalog-entry.yaml with the sha filled in to:
#      plugin-catalog/hermes-session-costs.yaml

# 4. Open the PR against NousResearch/hermes-agent.
```

### Local pre-flight

Run Hermes' own validator against this package before submitting:

```bash
hermes plugins doctor .
hermes plugins validate .   # newer Hermes releases
```

`doctor` exercises the real discovery, manifest parsing, import and registration
paths and reports drift between declared and registered capabilities. It uses a
temporary `HERMES_HOME` and blocks direct socket connections during the check.

## Why a desktop plugin needs an agent half

The catalog's validation gate requires a `plugin.yaml` / `plugin.yml` /
`plugin.json` at the pinned commit, and runs `hermes plugins validate` against it.
A repository shipping only `desktop/plugin.js` fails that gate.

Hence the unified package shape: `plugin.yaml` plus `__init__.py` at the repo
root (the agent half — a manifest and a `register()` that both declare nothing)
alongside `desktop/plugin.js` (the desktop half — the whole feature). Hermes
installs it as one folder and loads the desktop half through its normal renderer
pipeline.

A manifest alone is not enough: Hermes imports a directory plugin as a module and
calls `register()` on it, so the folder must be importable. `hermes plugins
doctor .` reports exactly this (`No __init__.py in …` when it is missing).

One consequence worth knowing: the **desktop half of a unified package is
opt-in**, so catalog users must enable it in Settings → Plugins after installing.
