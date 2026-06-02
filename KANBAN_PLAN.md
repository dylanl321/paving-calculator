# PaveRate Kanban Board — Task Breakdown & Dependency Map

**Created:** June 2, 2026  
**Profile:** `paverate-dev` (Claude Sonnet 4, Claude Code CLI)  
**Repo:** `dylanl321/paving-calculator` → branch `feat/auth-and-data`  
**Merge Strategy:** Each task creates a feature branch → PR back to `feat/auth-and-data` → Integration task merges all

---

## Dependency Graph

```
SPRINT 1 (Parallel — all running now)
├── t_941c2cbe  fix: Job Site creation API ──────────────────┐
├── t_48477875  fix: Settings route ─────────────────────────┤
├── t_8b55593d  fix: Daily Log Add Entry ────────┐───────────┤
├── t_f447adf7  fix: Job Setup auto-close ───────┼───────────┤
└── t_7c4eb7e3  fix: Owner self-modification ────┼───────────┤
                                                 │           │
SPRINT 2 (Parallel — running now)                │           │
├── t_ca711a4e  feat: Mobile touch targets ──────┼─────┐─────┤
└── t_b2b636dc  feat: Visual affordances ────────┼──┐──┤─────┤
                                                 │  │  │     │
SPRINT 3 (Blocked — waits for Sprint 2)          │  │  │     │
└── t_e797fc58  feat: Glossary & onboarding ─────┼──┘──┘     │
                                                 │           │
SPRINT 4 (Blocked — waits for Daily Log fix)     │           │
├── t_c847f394  feat: Per-load tracker ──────────┘           │
│       │                                                    │
│       └── t_7e32101d  feat: Offline mode                   │
│                                                            │
INTEGRATION (Blocked — waits for ALL Sprint 1+2)             │
└── t_6d94ab2f  chore: Merge & validate ─────────────────────┘
```

---

## Task Details

### Sprint 1: Fix What's Broken (Parallel, No Dependencies)

| ID | Title | Branch | Priority | Status |
|----|-------|--------|----------|--------|
| `t_941c2cbe` | fix: Job Site creation API silent failure | `fix/job-site-creation` | 1 | 🟢 running |
| `t_48477875` | fix: Settings route redirects to dashboard | `fix/settings-route` | 2 | 🟢 running |
| `t_8b55593d` | fix: Daily Log '+ Add Entry' button broken | `fix/daily-log-add-entry` | 3 | 🟢 running |
| `t_f447adf7` | fix: Job Setup stays open when switching calcs | `fix/job-setup-auto-close` | 4 | 🟢 running |
| `t_7c4eb7e3` | fix: Owner self-demote/self-remove guard | `fix/owner-self-modification` | 5 | 🟢 running |

### Sprint 2: Mobile-First & UX (Parallel, No Dependencies)

| ID | Title | Branch | Priority | Status |
|----|-------|--------|----------|--------|
| `t_ca711a4e` | feat: 48px touch targets + mobile layout | `feat/mobile-touch-targets` | 6 | 🟢 running |
| `t_b2b636dc` | feat: Visual affordances + toast feedback | `feat/ui-feedback-affordances` | 7 | 🟢 running |

### Sprint 3: Accessibility (Depends on Sprint 2)

| ID | Title | Branch | Parents | Status |
|----|-------|--------|---------|--------|
| `t_e797fc58` | feat: Glossary, tooltips, onboarding | `feat/glossary-onboarding` | `t_ca711a4e`, `t_b2b636dc` | ⏸ todo |

### Sprint 4: Killer Features (Depends on Daily Log fix)

| ID | Title | Branch | Parents | Status |
|----|-------|--------|---------|--------|
| `t_c847f394` | feat: Per-load ticket tracker | `feat/per-load-tracker` | `t_8b55593d` | ⏸ todo |
| `t_7e32101d` | feat: Offline mode + sync | `feat/offline-mode` | `t_c847f394` | ⏸ todo |

### Integration Gate (Depends on ALL Sprint 1+2)

| ID | Title | Branch | Parents | Status |
|----|-------|--------|---------|--------|
| `t_6d94ab2f` | chore: Merge & validate all branches | `chore/integration-validation` | All Sprint 1+2 tasks | ⏸ todo |

---

## Workflow Per Task

Each worker follows this flow:

1. **Clone** repo to isolated worktree
2. **Branch** from `feat/auth-and-data` 
3. **Implement** using Claude Code (`claude -p --dangerously-skip-permissions --max-turns 150`)
4. **Validate** build passes (`npm run build` / `vite build`)
5. **Check** for overlap with other branches (shared files like layout, stores, config)
6. **Commit** with conventional commit format
7. **Push** branch and create PR to `feat/auth-and-data`
8. **Complete** kanban task with summary of changes

## Overlap Management

Tasks that may conflict on shared files:
- **Mobile layout** (`t_ca711a4e`) and **Visual affordances** (`t_b2b636dc`) both touch UI components → separated by concern (CSS sizing vs behavior/toasts)
- **Job Site fix** (`t_941c2cbe`) and **Settings** (`t_48477875`) both touch dashboard routes → different route directories
- **Daily Log fix** (`t_8b55593d`) feeds into **Per-load tracker** (`t_c847f394`) → sequential dependency enforced
- The **Integration task** (`t_6d94ab2f`) handles any remaining conflicts at merge time

## Profile Configuration

```
Profile:     paverate-dev
Model:       us.anthropic.claude-sonnet-4-6 (Bedrock)
Skills:      claude-code, kanban-codex-lane (auto-loaded)
Workspace:   worktree (isolated git worktrees per task)
Description: SvelteKit/TypeScript developer for PaveRate web app
```

## Commands

```bash
# Check board status
hermes kanban list

# Watch a specific task
hermes kanban show <task_id>

# View worker logs
hermes kanban tail <task_id>

# Reclaim a stuck task
hermes kanban reclaim <task_id>
```
