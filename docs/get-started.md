---
title: 'Quick start'
description: 'Three commands: install Vizoalica from npm, deploy a backend to your own Cloudflare account, and open the console. Then add your website.'
---

# Quick start

Three commands give you your own analytics backend in your Cloudflare account and a console to read it. No source checkout is needed.

```sh
npm install -g vizoalica
vizoalica env add prod    # deploys the backend to your Cloudflare account
vizoalica console         # opens the console at http://127.0.0.1:4318
```

## How it fits together

![Many websites send privacy-filtered events to a backend in your Cloudflare account, which stores raw events in R2 and summaries in D1. Analyst consoles on their own computers read the results from that backend.](./assets/at-a-glance.svg)

- **Backend**: a Worker, a D1 database, and an R2 bucket in your Cloudflare account. It receives, filters, and stores events.
- **Console**: a local web app on your computer, started on demand. Its browser never holds a remote credential.
- **Websites**: each site loads the browser SDK and a small token endpoint that lets visitors' browsers send events.

## Before you start

- Node.js 22 or newer, on macOS or Linux (on Windows, use WSL).
- A Cloudflare account with R2 enabled.
- A Cloudflare API token with **Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, and Account Settings: Read**. Create it under My Profile → API Tokens → Create Token → Custom token, or keep it in [OneCLI](/operations/onecli).

## 1. Install

```sh
npm install -g vizoalica
```

## 2. Deploy your backend

```sh
vizoalica env add prod
```

It asks one question at a time and explains each. Say **yes** to deploying. It creates a Worker, a D1 database, and an R2 bucket named `prod-vizoalica-…`, then checks that they work. Ctrl-C stops without changing anything.

At the end it shows **two secrets once and waits until you type `saved`**. Put both in a password manager: every website you add needs `VIZOALICA_TOKEN_SECRET`. Lost one? `vizoalica rotate prod token` replaces it.

::: warning Run this step yourself
If you use an AI coding agent, run `vizoalica env add` in your own terminal. The secrets are shown once and should not pass through an agent conversation.
:::

## 3. Open the console

```sh
vizoalica console
```

It opens `http://127.0.0.1:4318` in your browser. If something is not set up yet, a welcome page says what is wrong and which command fixes it.

## 4. Add your website

In the console, open **Websites** → **Add website** and enter the site's production origin. The website's **Install** page gives numbered steps for GitHub → Cloudflare Pages or a pasted snippet, and ends with **Check now**, which confirms page views are arriving. See the [tour](/tour) for screenshots.

## More options

::: details Connect to a backend that already exists
Say **no** to deploying in `vizoalica env add`, then give its Worker address, your role, and your secret. See [Environments](/operations/environments).
:::

::: details Run dev, stage, and prod side by side
Run `vizoalica env add` once per name. Each environment gets its own Worker, secrets, and access keys, named after it so they never collide in one Cloudflare account. A picker in the console switches between them.
:::

::: details Script it without questions
```sh
export CLOUDFLARE_API_TOKEN=...
vizoalica env add prod --deploy --yes --secrets-file ./prod-secrets.env --no-onecli
vizoalica env add prod --connect --url https://prod.example.workers.dev --role admin --secret-stdin --no-onecli
```

Deploying is also a command of its own: `vizoalica deploy prod` shows the plan, and `vizoalica deploy prod --apply` creates it. See [Create a backend](/operations/deploy).
:::

::: details Try it with sample data
From a source checkout (Node.js 22, Git, and Corepack), deploy a demo backend and send sample page views for a make-believe website:

```sh
git clone https://github.com/ehud-am/vizoalica.git && cd vizoalica
corepack enable && pnpm install
pnpm vizoalica backend && pnpm vizoalica connect && pnpm vizoalica demo
pnpm vizoalica env add demo && pnpm vizoalica console
```

`pnpm vizoalica demo --remove` deletes the sample.
:::

::: tip Something not working?
Add `--verbose` to any command. It prints each step with timings and never a secret, so the output is safe to paste into an issue. See [troubleshooting](/operations/troubleshooting).
:::

## Next

- [Activate a website](/operations/pages) in detail
- [Create a backend](/operations/deploy), or the [full backend guide](/operations/cloudflare) from a source checkout
- [Start the console day to day](/operations/operator-local)
- Update with `npm update -g vizoalica`; remove with `npm uninstall -g vizoalica`. Run `vizoalica help` for every command.
