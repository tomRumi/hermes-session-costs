# Install and upgrade

## Requirements

- Hermes Agent **desktop app**, version `>= 0.21`
- The desktop half enabled in **Settings → Plugins**

## Install

### Option A — install link (one click)

Click:

<a href="hermes://plugin/install?repo=tomRumi/hermes-session-costs&enable=1">Install in Hermes</a>

Or put this anchor on a page or in a README:

```html
<a href="hermes://plugin/install?repo=tomRumi/hermes-session-costs&enable=1">Install in Hermes</a>
```

Hermes opens a confirmation dialog naming the repo, linking the source, and
probing what the repo ships. Nothing installs until you confirm. `force=1`
replaces an existing install.

### Option B — CLI

```bash
hermes plugins install tomRumi/hermes-session-costs
```

### Then enable it

The desktop half of a unified package ships **opt-in** — it inventories in
**Settings → Plugins** but stays disabled until you turn it on. Enable
`hermes-session-costs` there. The chip appears in the status bar immediately;
no restart needed.

## Upgrading from a standalone copy

Earlier this plugin could be installed as a standalone desktop plugin at
`~/.hermes/desktop-plugins/session-stats/`. If that folder still exists, the two
copies both register a status-bar chip and you get **two chips side by side**.

Remove the standalone copy:

```bash
rm -rf ~/.hermes/desktop-plugins/session-stats
```

The chip may need a moment, or use ⌘K → **Reload desktop plugins**.

## Updating

```bash
hermes plugins update hermes-session-costs
```

Your enabled/disabled choice is preserved.

## Uninstalling

1. Disable the plugin in **Settings → Plugins**.
2. Remove the folder:

```bash
rm -rf ~/.hermes/plugins/hermes-session-costs
```

## Where it lives on disk

```
~/.hermes/plugins/hermes-session-costs/
├── plugin.yaml          # manifest: declares no capabilities
├── __init__.py          # agent half: registers nothing
└── desktop/
    └── plugin.js        # desktop half (the feature)
```

Both the confirmation dialog and Settings → Plugins can reveal the folder.
