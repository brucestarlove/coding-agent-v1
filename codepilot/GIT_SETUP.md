# Git Repository Setup

## Structure

This is a **single git repository** containing both documentation and code:

```
HL-challenge/                    # Root git repository
├── .git/                        # Git data (single repo for everything)
├── .gitignore                   # Root gitignore (applies to all)
├── README.md                    # Root README
│
├── docs/                        # Challenge documentation
│   ├── PRD.md                   # Product Requirements
│   ├── AESTHETICS.md            # Design guidelines
│   └── plans/                   # Implementation plans
│
└── codepilot/                   # Application monorepo (NOT a separate git repo)
    ├── .env.example             # Environment template
    ├── package.json             # Workspace root
    ├── pnpm-workspace.yaml      # Workspace config
    ├── server/                  # Backend package
    └── client/                  # Frontend package
```

## Important Notes

### Single Repository
- **One `.git/` directory** at the root (HL-challenge/)
- **One `.gitignore`** at the root (applies to all subdirectories)
- `codepilot/` is a subdirectory, **not** a nested git repo
- Clean structure: docs stay separate from code

### What's Tracked
- ✅ All source code in `codepilot/server/src/` and `codepilot/client/src/`
- ✅ Configuration files (package.json, tsconfig.json, vite.config.ts, etc.)
- ✅ Documentation in `docs/`
- ✅ `.env.example` (template)

### What's Ignored (from root .gitignore)
- ❌ `node_modules/` (dependencies)
- ❌ `.env` (secrets)
- ❌ `.pnpm-store/` (pnpm cache)
- ❌ `pnpm-lock.yaml` (currently ignored - see note below)
- ❌ `dist/` and `build/` (build outputs)
- ❌ IDE files (.vscode/, .idea/)
- ❌ OS files (.DS_Store)

## Lockfile Recommendation

Currently `pnpm-lock.yaml` is **ignored** for development flexibility.

**For production/deployment**, you should:
1. Remove `pnpm-lock.yaml` from `.gitignore`
2. Commit the lockfile: `git add pnpm-lock.yaml && git commit`
3. This ensures reproducible builds with exact dependency versions

## Git Workflow

### Initial Commit
```bash
cd /Users/bdr/Git/HL-challenge

# Add everything
git add .

# Create initial commit
git commit -m "Initial commit: Phase 0 setup complete"
```

### Daily Workflow
```bash
# Check status
git status

# Add changes
git add .

# Commit with message
git commit -m "Phase 1: Implement FileSystem tool"

# Push to remote (when ready)
git push origin main
```

### Working Directory
- Development commands run from: `codepilot/`
- Git commands run from: root (HL-challenge/)

## Branch Strategy (Optional)

For feature development:
```bash
# Create feature branch
git checkout -b phase-1-tools

# Work on feature...

# Merge back to main
git checkout main
git merge phase-1-tools
```

## .gitignore Priority

Git uses the **root `.gitignore`** for all files in the repository.
- No need for `codepilot/.gitignore` (removed)
- Single source of truth for ignored files
- Applies recursively to all subdirectories

---

**Status**: Single repo setup complete ✅


