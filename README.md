# BCup

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
and categories are stored in Convex. A resized copy is sent to OpenAI when a new photo is
added or Identify/Retry AI is selected. Existing photos are only identified on
request.

An anonymous browser key in local storage keeps each browser's Convex photos separate.
There is no account sign-in or cross-device sync. Clearing browser storage loses access
to those photos. Photos saved by the previous IndexedDB version are not migrated.
On upload, AI
identifies the object and selects an existing category or suggests a common new
one. You can create categories and change any photo's category yourself; a
manual choice is preserved when AI identification is retried.

## Checks

```bash
pnpm lint
pnpm lint:lime
pnpm typecheck
pnpm build
```
