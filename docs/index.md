---
layout: home
title: 'Vizoalica — open-source, privacy-first web analytics'
titleTemplate: false
description: 'Open-source, self-hosted, privacy-first web and product analytics that runs in your own Cloudflare account. One command sets it up, and your visitors’ data stays in infrastructure you control.'
hero:
  name: Vizoalica
  text: Web analytics that stay in your own Cloudflare account
  tagline: Open source, self-hosted, and privacy-first. One command sets it up, and your visitors’ data stays in infrastructure you control.
  image:
    src: /brand/vizoalica-mark.svg
    alt: ''
  actions:
    - theme: brand
      text: Get started
      link: /get-started
    - theme: alt
      text: Take the tour
      link: /tour
    - theme: alt
      text: View on GitHub
      link: https://github.com/ehud-am/vizoalica
features:
  - title: Your data, your account
    details: Vizoalica runs on Cloudflare Workers, D1, and R2 in your own account. There is no hosted service between you and your visitors’ data.
  - title: Privacy-minimal by default
    details: It collects page views and custom events, with URLs, referrers, and properties minimised before delivery. It never collects form values, page text, or session replay, and it records the consent state on every event.
  - title: One command to install
    details: <code>pnpm vizoalica install</code> deploys the backend, connects this computer as the console, and sends sample page views, in about two minutes.
  - title: A console that stays local
    details: The operator console runs on demand on an admin’s computer. Its browser never holds a remote credential, and there is a clear line between viewing analytics and managing setup.
  - title: Open standards
    details: CloudEvents batches, JSON Schema validation, and short-lived signed (JWT/JOSE) ingest tokens, under the MIT license.
  - title: Made to be read by people and agents
    details: Plain Markdown guides, a step-by-step activation flow, and an <a href="/llms.txt">llms.txt</a> so coding agents can find their way around.
---

## Vizoalica in 13 seconds

<IntroVideo />

## Set it up in three parts

A Vizoalica installation has three parts. Set them up in this order, because each one needs something the previous one produces.

<div class="promo-steps">
  <div><strong>1. Backend</strong>A Cloudflare Worker, database, and storage in your account that receive, filter, and store events. <a href="/operations/cloudflare">Deploy the backend</a></div>
  <div><strong>2. Console</strong>A local web app on an admin’s computer for projects, websites, and analytics. <a href="/operations/local-analytics">Set up the console</a></div>
  <div><strong>3. Website</strong>Your site loads the browser SDK and a small token endpoint. <a href="/operations/pages">Activate a website</a></div>
</div>

## Try it with one command

You need Node.js 22 or newer, Git, and a Cloudflare account. macOS and Linux are supported.

```sh
git clone https://github.com/ehud-am/vizoalica.git && cd vizoalica
corepack enable && pnpm install
pnpm vizoalica install
```

It creates a real backend in your Cloudflare account, sets up this computer as the console, and sends sample page views for a make-believe website, so you are looking at real analytics about two minutes later. Only the sample data is throwaway. [Read the quick start](/get-started) or [see the console first](/tour).

## Built in the open

Vizoalica is [open source under the MIT license](https://github.com/ehud-am/vizoalica/blob/main/LICENSE). Read how it handles data in the [privacy defaults](/operations/privacy), what it costs to run in the [cost model](/operations/cost-model), and what changed in the [release notes](/releases/v0.6.1).

## Help shape it

Vizoalica gets better when the people who run it say what would make it more useful. You do not need to write code.

<div class="promo-steps">
  <div><strong>Share an idea</strong>What is missing, or could be simpler? <a href="https://github.com/ehud-am/vizoalica/discussions/categories/ideas">Start a discussion</a></div>
  <div><strong>Report a problem</strong>Something broke or was confusing. <a href="https://github.com/ehud-am/vizoalica/issues/new/choose">Open an issue</a></div>
  <div><strong>Build with us</strong>Small tasks, docs fixes, and bigger features. <a href="/community">See how to get involved</a></div>
</div>
