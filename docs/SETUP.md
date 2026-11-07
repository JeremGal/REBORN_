# Setup

Everything below was installed and tested on Windows 10 without administrator rights (07/11/2026). macOS / Linux are simpler.

## 1. Repository

```bash
git clone https://github.com/AlanECE/ReBorn && cd ReBorn
npm install                       # ajv, ajv-formats, yaml
node tools/reborn.mjs doctor      # what is found, what is missing
```

Machine-specific paths go in `reborn.local.json` (gitignored):

```json
{
  "reaNode": "C:\\path\\to\\node-v24\\node.exe",
  "reaJs": "C:\\path\\to\\node_modules\\rea-agents\\scripts\\rea.mjs",
  "craftCli": "C:\\Users\\<you>\\.cargo\\bin\\craft-anything-cli.exe",
  "chrome": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "evidenceDir": "D:\\reborn-evidence"
}
```

All keys are optional: by default the CLI uses the current Node, finds a globally installed `rea-agents`, `craft-anything-cli` on the PATH, Chrome in its usual place, and `.evidence/` in the repo.

## 2. REA (block 2)

- Needs **Node ^22.23.4, ^24.22.1 or >=26.12.1**. If your system Node is older, use a portable Node just for REA (no admin needed) and point `reaNode` to it.
- `npm install --global rea-agents@6.8.0 --omit=optional` (`--omit=optional` skips Frida, which instruments running targets and is not needed).
- Check: `rea --version`, `rea mcp doctor --json` (expects 229 tools, 6 prompts).
- Native engines (Ghidra, Hopper, IDA, JADX) are **optional**: JavaScript/Electron, .NET, web pages, HAR, SQLite, PE resources/imports work without them.

## 3. Craft Anything (block 2, and block 3 in clean room)

- Install Rust (user-level, no admin): `rustup-init.exe -y --profile minimal` from rust-lang.org (verify the SHA-256).
- Windows needs the MSVC C++ build tools (Visual Studio Build Tools 2019 or later) for the linker.
- `git clone https://github.com/storytold/craft-anything && cd craft-anything && cargo install --path apps/craft-anything-cli --locked` (about 22 minutes on our machine).
- Check: `craft-anything-cli doctor` (binary, Chromium, MCP self-test with 30 tools listed).
- **Clean room is the default**: it refuses to look inside the original. `--deep` reads code and files; the `reborn` CLI only passes `--deep` when `target.yaml` says `access.method` is `open-source`, `licence` or `provided-by-organizers`.
- Building with an agent (`rebuild`) launches the `claude` CLI installed on the machine.

## 4. MCP servers for Claude Code

`.mcp.json` at the repository root registers:

- `rea` through `node tools/mcp-rea.mjs` (picks the right Node and package from `reborn.local.json`, turns off output schemas: catalog 295 KB instead of 3.4 MB);
- `craft-anything` through `craft-anything-cli mcp`.

Claude Code asks you to approve project servers on first launch. Restart Claude Code after changing `.mcp.json`.

## 4b. Web capture provider (block 2)

`reborn doc <url>` and `reborn web <url>` capture public pages. The provider is pluggable:

- default: **Crawl4AI** in Docker (`docker pull unclecode/crawl4ai`).
- preferred when available: **Linkup** web agent. Set `WEB_PROVIDER=linkup` and `LINKUP_API_KEY=...` (env or `reborn.local.json.linkupApiKey`). The rest of the pipeline is unchanged; evidence is registered the same way.

## 5. Computer-use agent (block 1)

H Company Agents API (browser and desktop computer use; API, SDK, MCP or CLI). Credentials go in environment variables, never in the repository. The adapter that converts its output into `run.yaml` is to be written in `tools/` (format: `contracts/run.schema.json`).

The agent's work is pre-planned for it: `node tools/reborn.mjs ask <target>` turns every open question into a **computer-use-ready mission** (ordered `ui_steps` and the exact `read_values`, tied via `fills` to the acceptance scenario it completes). The handoff's `to_observe` lists, per feature, the minimal runs that would move it to `confirmed`.

## 6. Samples used to test the pipeline

- `targets/mmex`: Money Manager Ex 1.9.4 portable (GPL-2.0, native C++/wxWidgets). Download the official portable zip from its GitHub release, check the SHA-256 published by GitHub, extract **outside the repository**.
- `targets/dolibarr`: Dolibarr public demo (GPL-3.0), passive inspection of the public page.
