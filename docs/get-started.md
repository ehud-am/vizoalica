---
title: 'Quick start'
description: 'Deploy Vizoalica with a few commands, then connect your own website in three parts.'
---

# Quick start

Want to see Vizoalica working before you plan a production setup? A few commands do all three parts for a demo app: they deploy a real backend to your Cloudflare account, set up this computer as the console, and send sample page views for a make-believe website through that backend.

## What you need

- Node.js 22 or newer, Git, and a Cloudflare account.
- macOS or Linux. Windows is not supported yet.

## Install

```sh
git clone https://github.com/ehud-am/vizoalica.git && cd vizoalica
corepack enable && pnpm install
pnpm vizoalica backend    # deploys the backend and shows your three secrets once
pnpm vizoalica connect    # sets up this computer as an operator console
pnpm vizoalica demo       # sends sample page views
pnpm vizoalica env add demo   # adds the backend as an environment the console can open
pnpm vizoalica console    # starts the console in your browser
```

Each command asks for almost nothing. `backend` signs you in to Cloudflare, creates the database, storage bucket, and Worker and deploys them, and generates your three secrets, shown once (so you can save them in a password manager). `connect` sets up this computer as an operator console. `demo` sends sample page views. `env add` asks for the Worker address and the administrator secret and checks them. `console` starts the console in your browser, on that environment. (With the npm-installed command there is a shorter path, below: `vizoalica deploy` creates the backend and adds the environment in one step.)

::: warning Run it yourself
Setting this up with an AI coding agent? Run these commands yourself in a terminal. They show your secrets once, which should not pass through an agent conversation, and each guided command refuses to run without an interactive terminal for that reason.
:::

## Install the console from npm

You do not need a checkout at all. Install and start it:

```sh
npm install -g vizoalica
export CLOUDFLARE_API_TOKEN=...
vizoalica deploy prod --apply     # creates the backend and adds "prod" as an environment
vizoalica console
```

`vizoalica deploy prod` on its own shows what would be created and creates nothing; `vizoalica env add prod` adds a backend you already have ([Create a backend](/operations/deploy)). The console opens on your computer at `http://127.0.0.1:4318`, on the environment you used last. If no environment works yet, it shows a welcome page that says what is wrong with each one and which `vizoalica env` command fixes it. Update it with `npm update -g vizoalica`, remove it with `npm uninstall -g vizoalica`. Your settings stay in `~/.config/vizoalica/`; the list of environments is a plain file you can edit ([Environments](/operations/environments)).

::: tip One console, many backends
You can keep more than one independent environment (say "dev", "stage", and "prod"), each with its own Worker (a workers.dev address or your own domain), role, secret, and access keys, and pick between them in the console. Every resource an environment creates is named after it, so they never collide even in the same Cloudflare account. A website owner's or analyst's key always fixes their one environment.
:::

## The three parts, in order

Each part needs something the previous one produces.

| Order | Part        | Runs on                                | Set up with                               |
| ----- | ----------- | -------------------------------------- | ----------------------------------------- |
| 1     | **Backend** | Your Cloudflare account                | `vizoalica deploy <name> --apply`         |
| 2     | **Console** | An operator’s computer, only on demand | `vizoalica console` (after step 1)        |
| 3     | **Website** | Wherever your site is hosted           | The website’s Install page in the console |

Full guides:

- [Create a backend](/operations/deploy), or the [full backend guide](/operations/cloudflare)
- [Set up the console](/operations/local-analytics), or [with OneCLI](/operations/onecli) to keep the administrator secret out of a local file
- [Activate a website](/operations/pages)

## Connect your own website

In the console, open **Websites** and choose **Add website**, then enter its exact production origin. Saving takes you to the website’s **Install** page, which asks how the site is deployed (GitHub → Cloudflare Pages, or paste a snippet) and gives numbered steps ending with **Check now**, which confirms that page views are arriving. See the [tour](/tour) for what it looks like.

## Keep it running

`pnpm vizoalica` is the single entry point. Run `pnpm vizoalica help` to list the commands, and see [start the console day to day](/operations/operator-local) and [troubleshooting](/operations/troubleshooting) when something fails.
