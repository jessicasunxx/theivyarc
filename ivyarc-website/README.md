# XuTu / The Ivy Arc website

Bilingual educational consulting website for XuTu (叙途), with the 大藤文书工作室 logo and the Xiaohongshu account XUTU STUDIO.

This handoff contains the source of published Sites version 6, commit `c5240e527b2ac309433fa8cbc00fa1ad6a491ca6`, plus this guide. It contains no production secrets or private recipient address. The existing website remains hosted at https://xutu-admissions.cdeng.chatgpt.site.

## Project layout

- `public/index.html`: page content and form markup.
- `public/styles.css`: responsive styling.
- `public/app.js`: language switching and contact form interaction.
- `public/assets/`: logo and campus image.
- `worker/contact.mjs`: HTTP handler, static file serving, and Resend email integration.
- `worker/contact.test.mjs`: contact handler tests with mocked email transport.
- `scripts/build.mjs`: bundles public assets and the handler into one Worker module.
- `.env.example`: environment variable names only.
- `.openai/hosting.json`: identifies the existing Sites project; it is not a credential.

## Build and check

Use Node.js 22 or newer. There are no npm dependencies to install.

```sh
npm test
npm run build
```

The output is `dist/server/index.js`, a Cloudflare Workers-compatible ES module with a default `fetch(request, env)` handler. Supply environment values through the hosting provider's runtime bindings. The build does not read `.env` or embed secrets.

For a visual-only preview, serve `public/` using any local static server, for example:

```sh
python3 -m http.server 8000 --directory public
```

That preview does not implement `/api/contact`, so the form stays unavailable. A functional preview requires a Worker-compatible runtime with the environment bindings below. GitHub stores the source; GitHub Pages alone cannot run the email backend.

## Contact form: unfinished setup

Email delivery is currently disabled. The handler and UI are implemented, but a Resend sending key and authorized sender still need to be configured. Tests mock the provider; they do not confirm real email delivery.

| Variable | Setup |
| --- | --- |
| `CONTACT_RECIPIENT` | Owner's destination email, stored as a server secret. Ask the owner privately. |
| `RESEND_API_KEY` | Resend sending key, stored as a server secret. |
| `CONTACT_FROM` | Sender accepted by the owner's Resend account; use a verified sender/domain for production. |
| `SITE_ORIGIN` | Exact public origin, without a trailing slash; set to `https://theivyarc.com` when moving to that domain. |
| `CONTACT_ENABLED` | Keep `false` until configuration is complete; set `true` and perform a real delivery check before handing over. |

The recipient and API key must never go in `public/`, Git commits, browser JavaScript, or a mailto link. The visitor's email is used as Reply-To. Provider failures return a generic error, and submissions are not stored in a database. The rate limiter is best-effort and per Worker instance, not a durable global limit.

The current origin check accepts exactly one `SITE_ORIGIN`. If both the Sites URL and a custom hostname must accept submissions, explicitly support an allowlist of trusted origins in the handler. Do not allow arbitrary origins.

Hosted environment values are not included in this repository and do not transfer with GitHub. The owner must configure them separately on the chosen host. Changing values on the existing Sites deployment requires republishing the saved version.

## GitHub Pages hosting

`.github/workflows/deploy-pages.yml` (at the repository root) publishes `ivyarc-website/public/` to GitHub Pages on every push to `main` that changes it. It deploys the static files only: `/api/contact` does not exist there, so the form shows its "unavailable" message and points visitors to Xiaohongshu. Asset paths in `index.html` are relative so the page also works at the `https://jessicasunxx.github.io/theivyarc/` preview URL.

One-time setup:

1. Repository **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**. Free accounts can only use Pages on public repositories; making the repository private again later takes the site offline unless the account has GitHub Pro.
2. **Settings → Pages → Custom domain**: enter `theivyarc.com` and save. After the DNS check passes, tick **Enforce HTTPS**.
3. At the DNS provider (Wix), replace the existing root A records and `www` CNAME:

| Type | Host / Name | Value |
| --- | --- | --- |
| A | `@` (theivyarc.com) | `185.199.108.153` |
| A | `@` (theivyarc.com) | `185.199.109.153` |
| A | `@` (theivyarc.com) | `185.199.110.153` |
| A | `@` (theivyarc.com) | `185.199.111.153` |
| CNAME | `www` | `jessicasunxx.github.io` |

## Custom domain: theivyarc.com (ChatGPT Sites)

This section applies only if the site stays on Sites instead of GitHub Pages. The root domain has been added to the existing Sites project. Its last observed state was pending DNS validation on September 24, 2026. If continuing to use Sites, add these records at the domain's DNS provider:

| Type | Host / Name | Value |
| --- | --- | --- |
| A | `@` | `162.159.143.30` |
| A | `@` | `172.66.3.26` |
| TXT | `_openai-site-verification` | `openai-site-verification=_HHE8I3iOMi8OrE0S9mMyfrvP2bHUF-2LDmldrlbiNg` |
| TXT | `_cf-custom-hostname` | `8996072e-e040-45a0-805a-30cad7a74cd8` |

Replace conflicting root website records as appropriate; preserve email DNS records. These TXT values are public DNS verification records, not API secrets. Refresh custom-domain validation in Sites after saving. `www.theivyarc.com` has not been added; configure it separately if needed.

If moving hosting away from Sites, use the new host's DNS instructions instead of this table. GitHub access alone does not grant access to Sites, DNS, or Resend.

## Friend handoff

Create a private GitHub repository and add the friend as a collaborator. Push this folder, including the assets and `.env.example`, but never environment files or credentials. No open-source license has been granted by this handoff. Deploying to a new host is a separate step; the current public website does not automatically follow GitHub commits.
