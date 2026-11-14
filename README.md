# Blobe

Next.js App Router project using TypeScript, Tailwind CSS, ESLint, Convex, and pnpm.
The UI uses the [Lime design system](https://design.how/systems/lime). Follow
[the local Lime skill](.agents/skills/lime/SKILL.md) for UI changes.

## Run locally

```bash
pnpm install
pnpm exec convex dev
```

In another terminal:

```bash
pnpm dev
```

The Convex CLI creates `.env.local` with `NEXT_PUBLIC_CONVEX_URL` when you
select a deployment. Open http://localhost:3000. The product brief is in
[task.md](task.md).

To identify objects in photos with OpenAI GPT-6.1 Terra, add your OpenAI API
key as `OPENAI_API_KEY` in `.env.local` and restart the dev server. Photos
and categories are stored in Convex. Add `REMOVE_BG_API_KEY` to `.env.local`
and restart the dev server to remove backgrounds on new uploads. The app sends
a resized copy to remove.bg, crops the transparent result, adds a white outline,
and stores that PNG. Background removal must succeed before a new photo is saved.
A resized copy of the original is sent to OpenAI when a new photo is added.
Existing photos are only identified on request and are not automatically
converted to cutouts.

An anonymous browser key in local storage keeps each browser's Convex photos separate.
There is no account sign-in or cross-device sync. Clearing browser storage loses access
to those photos. Photos saved by the previous IndexedDB version are not migrated.
On upload, AI identifies the object and selects an existing category or suggests
a common new one. You can change an object's category on its page; a manual
choice is preserved when AI identification is retried.

Short video uploads accept MP4, WebM, or MOV files up to 15 seconds and 20 MB.
The browser samples four frames; OpenAI uses them to write three to five simple
action descriptions with English translations and useful words or phrases.
The original clip and a poster frame are stored in Convex. Description audio is
generated on first play and saved there too. Clip vocabulary joins photo words
in the existing practice quiz. Video descriptions are based on sampled visual
frames only; audio and unseen actions are not analyzed.

## Checks

```bash
pnpm lint
pnpm lint:lime
pnpm typecheck
pnpm build
```
