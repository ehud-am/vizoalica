# Contributing to Vizoalica

Thank you for wanting to help. Vizoalica gets better when the people who run it say what works,
what does not, and what is missing, and you do not have to write code to do that. Every kind of
contribution is welcome, and small ones count.

Please read the [code of conduct](CODE_OF_CONDUCT.md) first. Everyone taking part agrees to it.

## Ways to help

From the lightest to the heaviest:

1. **Try it and tell us what happened.** Follow the [quick start](docs/get-started.md). If a step was
   confusing or broke, that is the most useful thing you can report, and easy to do as a
   [bug report](https://github.com/ehud-am/vizoalica/issues/new?template=bug_report.yml) or a
   [documentation problem](https://github.com/ehud-am/vizoalica/issues/new?template=docs_problem.yml).
2. **Share an idea.** What would make Vizoalica more useful to you? Start a topic in
   [Discussions → Ideas](https://github.com/ehud-am/vizoalica/discussions/categories/ideas). A rough
   thought is fine. Others can add to it, and it can become an issue later.
3. **Answer a question,** or show how you run it in
   [Show and tell](https://github.com/ehud-am/vizoalica/discussions/categories/show-and-tell).
4. **Improve the docs.** Every page on [vizoalica.dev](https://vizoalica.dev) has an **Edit this
   page on GitHub** link, so a typo or a clearer sentence is a pull request away.
5. **Pick up an issue.** Look for
   [`good first issue`](https://github.com/ehud-am/vizoalica/labels/good%20first%20issue) (small and
   well described) or [`help wanted`](https://github.com/ehud-am/vizoalica/labels/help%20wanted)
   (larger, and the maintainer would welcome the help). Comment that you are taking it so two people
   do not do the same work.
6. **Build something bigger.** Open an idea or an issue first (see below).

## Before you build something

For anything beyond a small fix, talk first. It saves you from spending a weekend on a change that
does not fit.

1. Start with an **Ideas** discussion, or a
   [feature request](https://github.com/ehud-am/vizoalica/issues/new?template=feature_request.yml) if
   you already know what you want.
2. Agree on the outline with the maintainer and anyone else interested. Say if you plan to build it.
3. Send a pull request that links the issue.

Ideas are judged against what the project is for, so you can tell early whether one fits:

- **Privacy-minimal.** It should not collect more about visitors than it needs, and never form
  values, page text, or session replay. See [privacy defaults](docs/operations/privacy.md).
- **Self-hosted and portable.** It runs in the operator's own Cloudflare account, with no service
  of ours in the middle.
- **Easy to audit.** A self-hosting operator should be able to read what it does.
- **Cheap and simple to run.** Check the [cost model](docs/operations/cost-model.md) when a change
  adds storage or requests.
- **Accessible.** The console keeps WCAG 2.2 AA.

A good idea that does not fit is still worth sharing. It may suit an example, a guide, or a fork,
and the discussion helps others.

## What to expect

The maintainer aims to look at new issues, discussions, and pull requests within a week, and will
say if something is not a fit and why. Reviews are about the change, not the person. If a pull
request needs work, you will get specific suggestions, and you are welcome to ask for help finishing
it. A contribution you make is released under the project's [MIT license](LICENSE).

## Development setup

You only need a checkout to work on Vizoalica or to deploy a backend. To run the console, install the
package instead: `npm install -g vizoalica`, then `vizoalica console`.

Requirements are Node.js 22 or newer and the pnpm version declared in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm validate
pnpm build
```

Changes to responsive layout or accessibility should also run:

```sh
pnpm test:e2e
```

## Pull requests

- Link the issue or discussion it comes from.
- Describe the operator or user outcome and any migration, compatibility, security, privacy, or
  cost impact.
- Add or update tests for observable behavior.
- Update the specification and operational documentation when contracts or workflows change.
- Keep unrelated refactors out of the same pull request.
- Confirm formatting, lint, type checking, tests, coverage, build, browser checks, and the
  production dependency audit pass before requesting review.

## Protect private information

Never commit `.env` files, Wrangler production configuration, deployment profiles, OneCLI output,
Cloudflare identifiers tied to a private account, secrets, tokens, receipts, audit logs, raw event
payloads, or visitor data. Use `example`, `example.com`, and explicit placeholders in tests and
documentation. If a credential is exposed, rotate it before doing anything else and follow
[SECURITY.md](SECURITY.md).

## Releases and deployments

A source release never deploys an operator's installation. Maintainers follow
[the release guide](docs/operations/releases.md); operators independently choose and deploy a
reviewed release using the Cloudflare operations guide.
