# Contributing

Several people push to this repo, so keep to these rules to avoid merge pain.

## Workflow
1. Pull before you start: `git pull origin main`
2. Branch off main: `git checkout -b <your-name>/<short-feature>`
3. Commit small and often with clear messages.
4. Before pushing, sync: `git pull --rebase origin main`
5. Push your branch: `git push -u origin <your-branch>`
6. Open a pull request into `main` and get one teammate to look at it.

## Rules
- Don't push directly to `main`, and never force-push it.
- Work in separate folders or files where possible so we don't collide.
- Never commit secrets. Use `.env` locally and share keys privately. Keep a `.env.example` with placeholder names only.
- Tell the team before changing shared files (config, dependencies, lockfiles).

## Merge conflicts
Don't panic. Pull, resolve the marked sections, run the app, then commit. If unsure, ask the other author.
