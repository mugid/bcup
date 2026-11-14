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

To identify objects in photos with OpenAI GPT-6.1 Terra, add a server-side
`AI_GATEWAY_API_KEY` to `.env.local` from Vercel AI Gateway. Photos remain in
this browser; a resized copy is sent to the AI service when a new photo is
added or Identify/Retry AI is selected. Existing photos are only identified on
request.

Convex is connected, but the current photo screen still saves photos in this
browser. The `photos` table is reserved for a later backend photo flow.

## Checks

```bash
pnpm lint
pnpm lint:lime
pnpm typecheck
pnpm build
```
