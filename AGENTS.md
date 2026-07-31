# Codex Repository Guardrails

## Worktree and Deploy Alignment

- Keep the active development work in a single primary worktree whenever possible. For this repo, use `C:\Users\gianc\Documents\codice\lorenzozanna` as the primary worktree.
- Do not deploy from a temporary or isolated worktree unless the deployed commits are also merged back into the primary branch before the task is considered done.
- Before any deploy, run and inspect:
  - `git status --short --branch`
  - `git worktree list`
  - `git log --oneline --decorate -5`
- If a temporary worktree is created for safety, remove it or explicitly report why it must remain before ending the task.
- Never leave Cloudflare production ahead of the primary worktree. After a production deploy, make sure the exact deployed code is committed, pushed, and present in the primary worktree.
- If there are local uncommitted changes before a merge or deploy, create an explicit checkpoint branch/commit first instead of mixing dirty state with deployment work.
- Before finishing work that touched deployment code, confirm in the final response:
  - active branch;
  - whether all worktrees are clean;
  - whether Cloudflare was deployed;
  - which commit matches the deployed code, if any.

