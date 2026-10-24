# Contributing to RAGSeal

Welcome to **RAGSeal** (HYPNEXIS'26, Problem Statement AI-04, Team Monster Energy).

To maintain code quality and avoid merge collisions during rapid multi-agent and multi-author development, please follow these guidelines.

---

## 1. Branching & Git Workflow

1. **Always start from latest `main`**:
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Create a feature branch using `name/feature` format**:
   ```bash
   git checkout -b <your-name>/<short-feature>
   # Examples:
   #   vidhaath/repo-polish
   #   sarthak/backend-api
   #   vidhaath/ui-frontend
   ```
3. **Commit frequently with descriptive messages**:
   ```bash
   git commit -m "feat(engine): add counterfactual replay for distractor cases"
   ```
4. **Rebase before pushing**:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
5. **Push and open a Pull Request**:
   ```bash
   git push -u origin <your-name>/<short-feature>
   ```
   Open a PR targeting `main`. Request a teammate review before merging.

---

## 2. Hard Rules

- **No Direct Pushes to `main`**: All changes must land via Pull Requests. Never force-push `main`.
- **Never Commit Secrets**:
  - Do not commit `.env`, API keys, or personal tokens.
  - Keep `backend/data/` untracked (local SQLite runs and caches remain local).
  - Use `.env.example` for public environment variable templates.
- **Respect Subsystem Ownership**:
  - `/engine`: Core evaluation algorithms, replay logic, metrics, and test packs.
  - `/backend`: FastAPI routers, schema models, and orchestration endpoints.
  - `/frontend`: React 18, Vite, UI components, and client API state.
  - `/docs`: Technical specs, contract definitions, and architecture assets.
- **Coordinate Shared Dependencies**: Always notify the team before editing root configurations, lockfiles, or shared data contracts.

---

## 3. Resolving Merge Conflicts

1. Pull the latest upstream changes: `git fetch origin`
2. Rebase your branch onto main: `git rebase origin/main`
3. Inspect and resolve conflicts in your editor.
4. Verify tests pass locally:
   - Backend & Engine: `pytest engine/ backend/`
   - Frontend: `npm run lint` or `npm run build`
5. Continue rebase: `git rebase --continue`
6. Push with `--force-with-lease` to your feature branch if needed:
   ```bash
   git push --force-with-lease origin <your-name>/<short-feature>
   ```

---

## 4. Questions & Support

For questions, ping the team on Slack/Discord or email **govidanidarsh@gmail.com**.
