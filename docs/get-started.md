---
title: 'Quick start'
description: 'Install Vizoalica with one command, then connect your own website in three parts.'
---

# Quick start

Want to see Vizoalica working before you plan a production setup? One command does all three parts for a demo app: it deploys a real backend to your Cloudflare account, sets up this computer as the console, and sends sample page views for a make-believe website through that backend.

## What you need

- Node.js 22 or newer, Git, and a Cloudflare account.
- macOS or Linux. Windows is not supported yet.

## Install

```sh
git clone https://github.com/ehud-am/vizoalica.git && cd vizoalica
corepack enable && pnpm install
pnpm vizoalica install
```

The command asks for almost nothing. It signs you in to Cloudflare, creates the database, storage bucket, and Worker and deploys them, generates your three secrets and shows them once (so you can save them in a password manager), sets up this computer as an operator console, and starts the console in your browser.

::: warning Run it yourself
Setting this up with an AI coding agent? Run `pnpm vizoalica install` yourself in a terminal. It shows your secrets once, they should not pass through an agent conversation, and the command refuses to run without an interactive terminal for that reason.
:::

## Install the console from npm

You do not need a checkout to run the console. Once a backend exists, install it and start it:

```sh
npm install -g vizoalica
vizoalica console
```

The console starts on your computer at `http://127.0.0.1:4318`. The first time, it asks who you are (an admin, a website owner, or an analyst) and adapts, keeping you on the path from a running console, to a backend, to your websites, to results. Anything that cannot work yet is shown as unavailable, with the reason and the next step. Update it with `npm update -g vizoalica`, remove it with `npm uninstall -g vizoalica`. Your settings stay in `~/.config/vizoalica/`.

::: tip This release installs the console
Deploying the backend for the first time is still done from a source checkout with `pnpm vizoalica install`, as above. The console then connects to it. Deploying from the console itself is planned for the next release.
:::

## The three parts, in order

Each part needs something the previous one produces.

| Order | Part        | Runs on                                | Set up with                               |
| ----- | ----------- | -------------------------------------- | ----------------------------------------- |
| 1     | **Backend** | Your Cloudflare account                | `pnpm vizoalica backend` (or `install`)   |
| 2     | **Console** | An operator’s computer, only on demand | `pnpm vizoalica connect` (or `install`)   |
| 3     | **Website** | Wherever your site is hosted           | The website’s Install page in the console |

Full guides:

- [Deploy the backend](/operations/cloudflare)
- [Set up the console](/operations/local-analytics), or [with OneCLI](/operations/onecli) to keep the administrator secret out of a local file
- [Activate a website](/operations/pages)

## Connect your own website

In the console, open **Websites** and choose **Add website**, then enter its exact production origin. Saving takes you to the website’s **Install** page, which asks how the site is deployed (GitHub → Cloudflare Pages, or paste a snippet) and gives numbered steps ending with **Check now**, which confirms that page views are arriving. See the [tour](/tour) for what it looks like.

## Keep it running

`pnpm vizoalica` is the single entry point. Run `pnpm vizoalica help` to list the commands, and see [start the console day to day](/operations/operator-local) and [troubleshooting](/operations/troubleshooting) when something fails.
