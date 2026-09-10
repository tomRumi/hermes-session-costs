"""Hermes Session Costs — agent half.

This package's entire feature is the DESKTOP half: `desktop/plugin.js`, a Hermes
desktop-app plugin that contributes a status-bar chip (per-session tokens, cost
and context window) and a details panel with a Compress button.

The agent half deliberately registers NOTHING: no tools, no hooks, no slash
commands, no background work. It exists because Hermes requires a directory
plugin to be an importable module with a `register()` entry point, and because
the plugin catalog's validation gate runs `hermes plugins validate` against this
directory.

So the honest declaration is an empty one — `plugin.yaml` lists no capabilities
and this module registers none, which is exactly what they should agree on.

The plugin is installed and loaded as one folder:

    ~/.hermes/plugins/hermes-session-costs/
    ├── plugin.yaml          # manifest: declares no capabilities
    ├── __init__.py          # this file: registers nothing
    └── desktop/
        └── plugin.js        # the whole feature (desktop UI)

The desktop half ships opt-in: it inventories in Settings -> Plugins but stays
disabled until the user enables it, matching every unified package's desktop
half.

https://github.com/tomRumi/hermes-session-costs
"""


def register(ctx) -> None:  # noqa: ARG001 - signature required by the plugin contract
    """No-op entry point: this plugin adds nothing on the agent side.

    Intentionally empty. Any tool, hook or command registered here would be a
    capability the manifest does not declare, and the catalog's validation gate
    treats undeclared capability creep as a security issue. The feature lives
    entirely in ``desktop/plugin.js``.
    """
    return None
