# Use Vizoalica with AI

Ask an AI assistant about your analytics in plain words: "How did traffic change this week?", "Which buttons
on /pricing get clicked?", "Is my new site sending data?", "Does prod need an update?". Vizoalica gives the
assistant two things:

- **An MCP server**, `vizoalica mcp`, that reads analytics and health from your backends. It runs on your
  computer, started by the AI client, and works on **every environment** you have set up with `vizoalica env`.
- **A skill** that teaches the assistant how Vizoalica works: its data, setup, health, operations, and
  troubleshooting.

Both are **read-only**. Nothing they do creates, changes, or deletes anything, and your secrets never reach the
AI client: the server uses the credentials in `~/.config/vizoalica/environments.json` (or OneCLI) itself and
returns only results.

## Set it up

You need the `vizoalica` command (`npm install -g vizoalica`) and at least one working environment
(`vizoalica env list`). Then, for your client:

```sh
vizoalica mcp install --client claude-code      # or claude-desktop, codex, cursor
vizoalica skill install --client claude-code    # or codex
```

Restart the client. `vizoalica mcp install` adds a server named `vizoalica` to the client's MCP settings: for
Claude Code it runs `claude mcp add --scope user`; for Claude Desktop, Codex, and Cursor it edits their settings
file, changing only the `vizoalica` entry and asking before it replaces one. Add `--print` to see the change
without making it. The entry runs this Node.js and this package by their full paths, because desktop apps do
not see your shell's `PATH`; run `vizoalica mcp install` again after you change Node.js versions.

For Claude Desktop or claude.ai, add the skill by uploading `vizoalica-skill.zip` from the
[GitHub release](https://github.com/ehud-am/vizoalica/releases) (Settings, Capabilities, Skills).
`vizoalica skill path` shows where the packaged copy is.

Any other MCP client: configure it to run `vizoalica mcp` over stdio.

## Which environment an answer is about

One server covers all your environments, like the console. Every answer starts with a line naming the
environment it came from, its role, and address:

```text
Environment: prod (admin, https://analytics.example.com; default: the one last used in the console)
```

- A conversation starts on the environment the console used last (or the only one, or the first that works).
- Ask about another one by name ("in stage, ...") and the assistant passes `environment` to that one call.
- "Switch to stage" makes stage the default for the rest of the conversation. It does not change the console.
- `list_environments` shows every environment, whether it works, and why not.

## What the assistant can read

| Tool                     | What it answers                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `list_environments`      | Every environment, whether it works, which one this conversation uses                            |
| `use_environment`        | Switch this conversation's environment                                                           |
| `get_environment_status` | Role and scope, Worker and database versions against this package, database and storage health   |
| `list_websites`          | Projects and websites                                                                            |
| `get_website_status`     | Collection and configuration status, plus the console's install check of the live site           |
| `get_traffic_overview`   | Page views, visitors, trend, top pages (with each page's website), referrers, countries, devices |
| `compare_periods`        | A period against the one before, with the pages that changed most                                |
| `get_actions`            | Clicks on buttons and links, by page                                                             |

Projects and websites can be named by name or id. Ranges are UTC and at most 30 days per call, the same limit as
the console. An owner or analyst access key sees exactly what it sees in the console, nothing more. There are also
three ready-made prompts: `weekly_report`, `compare_weeks`, and `page_actions`.

## Privacy and security

- Results are the same aggregates the console shows: no visitor identifiers, raw events, or query strings.
- `get_website_status` probes the website's own public address (the same requests as the console's
  **Check now**); pass `check_site: false` to skip it.
- Your AI provider receives the results you ask for, just as if you pasted them into a chat. Use an access
  key with a narrower scope (Manage, Access keys) in an environment meant for AI use if you want to limit that.
- Commands that create or show secrets (`vizoalica env add`, `deploy`, `rotate`) stay in your own terminal; the
  skill tells the assistant to hand them to you rather than run them.

## Troubleshooting

- **The tools do not appear:** restart the client. Check the entry with `vizoalica mcp install --client <c> --print`.
- **"None of the environments works":** run `vizoalica env list` and fix what it reports.
- **Nothing on screen when you run `vizoalica mcp`:** it is meant to be started by an AI client, not typed.
- Add `--verbose` to the server's arguments in the client's settings to log each step to the client's MCP log
  (stderr). It never logs a secret.
