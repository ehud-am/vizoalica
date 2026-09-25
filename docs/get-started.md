---
title: 'Quick start'
description: 'Install Vizoalica from npm, deploy a backend to your Cloudflare account with one command, then connect your own website.'
---

# Quick start

Install the command, create a backend in your Cloudflare account, and open the console. No source checkout is needed.

## What you need

- Node.js 22 or newer, and a Cloudflare account with R2 enabled.
- macOS or Linux. Windows is not supported yet (use WSL).
- A Cloudflare API token with **Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, and Account Settings: Read** (My Profile → API Tokens → Create Token → Custom token), or [OneCLI](/operations/onecli) holding one.

## Install and deploy

```sh
npm install -g vizoalica
vizoalica env add prod    # "prod" is the environment name; its resources are named prod-vizoalica-…
vizoalica console
```

`vizoalica env add` asks one question at a time and explains each above its prompt. Say **yes** to deploying: it creates a D1 database, an R2 bucket, and a Worker, adds `prod` as an environment, and checks that it works. An answer it cannot use is asked again with the reason, and Ctrl-C stops without changing anything.

At the end it shows **two secrets, and waits until you type `saved`**. Save both in a password manager under the names shown. `VIZOALICA_TOKEN_SECRET` is needed by every website you add; the administrator secret is kept for you in `~/.config/vizoalica/environments.json` and never printed. Lost one? `vizoalica rotate prod token` (or `admin`, `digest`) replaces it.

Already have a backend, yours or a teammate's? Say **no** to deploying and give its Worker address, your role, and your secret ([Environments](/operations/environments)).

`vizoalica console` opens the console on your computer at `http://127.0.0.1:4318`, on the environment you used last. If no environment works yet, it shows a welcome page that says what is wrong with each and which `vizoalica env` command fixes it. Update with `npm update -g vizoalica`; remove with `npm uninstall -g vizoalica`.

::: warning Run it yourself
Setting this up with an AI coding agent? Run `vizoalica env add` yourself in a terminal. It shows your secrets once, and they should not pass through an agent conversation.
:::

::: tip Something not working?
Add `--verbose` to any command. It prints each step, question, request, and Wrangler call with timings, and never a secret or your answers, so it is safe to paste into an issue. See [troubleshooting](/operations/troubleshooting).
:::

::: tip One console, many backends
You can keep more than one independent environment (say "dev", "stage", and "prod"), each with its own Worker (a workers.dev address or your own domain), role, secret, and access keys, and pick between them in the console. Every resource an environment creates is named after it, so they never collide even in the same Cloudflare account. A website owner's or analyst's key always fixes their one environment.
:::

## The three parts, in order

Each part needs something the previous one produces.

| Order | Part        | Runs on                                | Set up with                               |
| ----- | ----------- | -------------------------------------- | ----------------------------------------- |
| 1     | **Backend** | Your Cloudflare account                | `vizoalica env add <name>` (deploys it)   |
| 2     | **Console** | An operator’s computer, only on demand | `vizoalica console` (after step 1)        |
| 3     | **Website** | Wherever your site is hosted           | The website’s Install page in the console |

Full guides:

- [Create a backend](/operations/deploy), or from a source checkout, the [full backend guide](/operations/cloudflare)
- [Environments](/operations/environments), and [OneCLI](/operations/onecli) to keep secrets out of local files
- [Activate a website](/operations/pages)

## Connect your own website

In the console, open **Websites** and choose **Add website**, then enter its exact production origin. Saving takes you to the website’s **Install** page, which asks how the site is deployed (GitHub → Cloudflare Pages, or paste a snippet) and gives numbered steps ending with **Check now**, which confirms that page views are arriving. See the [tour](/tour) for what it looks like.

## Try it with sample data

Want to see the console full of data before your own site is connected? From a source checkout (Node.js 22, Git, and Corepack), the older guided commands deploy a demo backend and send sample page views for a make-believe website:

```sh
git clone https://github.com/ehud-am/vizoalica.git && cd vizoalica
corepack enable && pnpm install
pnpm vizoalica backend && pnpm vizoalica connect && pnpm vizoalica demo
pnpm vizoalica env add demo && pnpm vizoalica console
```

`pnpm vizoalica demo --remove` deletes the sample.

## Keep it running

Run `vizoalica help` to list the commands, and see [start the console day to day](/operations/operator-local) and [troubleshooting](/operations/troubleshooting) when something fails.
