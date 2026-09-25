---
name: handoff
description: Generate a session handoff document that captures current project context for continuity across Claude Code sessions or workstations. Use when the user wants to save session state, create a handoff, hand over context, wrap up a session, or prepare for continuing work later. Invoke with /handoff.
---

The user wants to capture their current session context into a `HANDOFF.md` file at the project root (the git repository root — `git rev-parse --show-toplevel`; never under `.claude/` or the user's home folder). This file should let a future Claude Code session (or the user on another workstation) get up to speed in under 30 seconds.

## Step 1: Gather Context Automatically

Run these commands yourself — do NOT ask the user to paste output:

```bash
# Current branch
git branch --show-current

# Recent commits (last 10, one-line)
git log --oneline -10

# Working tree status
git status --short

# Stash list
git stash list

# Recently modified files (last 24h, fallback to last 5 commits if find is unreliable)
git diff --name-only HEAD~5 HEAD 2>/dev/null || git log --name-only --pretty=format: -5 | sort -u

# Check for CLAUDE.md
test -f CLAUDE.md && echo "CLAUDE.md exists" || echo "No CLAUDE.md"

# Top-level project structure (2 levels, ignore hidden dirs and node_modules)
find . -maxdepth 2 -not -path '*/\.*' -not -path '*/node_modules/*' | head -60
```

Also draw on your own memory of the current conversation — what the user asked you to do, what you worked on, what you changed, and any problems you encountered or solved.

## Step 2: Ask Once

After gathering context, ask the user **one question**:

> "Anything you'd like to add before I write the handoff — goals, decisions, blockers, or next steps?"

**Accept any short answer or decline gracefully.** If the user says "no", "nope", "just write it", or anything similar, proceed immediately with what you have. Do not ask follow-up questions.

## Step 3: Write HANDOFF.md

Create (or overwrite) `HANDOFF.md` in the repository root (`$(git rev-parse --show-toplevel)/HANDOFF.md`) with this structure:

```markdown
# Session Handoff

**Date:** YYYY-MM-DD
**Branch:** <current branch>

## Summary

<1-3 sentences: what this session was about>

## What Was Accomplished

<Bullet points of concrete things completed or changed>

## Key Decisions

<Any architectural choices, trade-offs, or approaches decided on.
Omit this section if there's nothing meaningful to note.>

## Current State

<Brief description of where things stand right now>

**Modified files:**
<List of files changed in this session, from git status + recent diffs>

**Staged changes:**
<What's staged for commit, or "None">

**Stash entries:**
<List stash entries, or "None">

## Known Issues

<Bugs, blockers, or things that didn't work. Omit if none.>

## Next Steps

<What the next session should pick up. Be specific — name files,
functions, or tasks. If the user didn't provide direction, infer
from the work done and note that these are suggested.>

## Relevant Files

<The 5-15 most important files for continuing this work, with a
one-line note on why each matters>
```

### Writing rules:

- Be direct and skimmable — this is a reference doc, not a narrative
- Omit any section that would be empty or meaningless (except Summary, What Was Accomplished, Current State, and Next Steps — always include those)
- Keep the total file under 150 lines — compress ruthlessly
- Write for a reader who has zero context about this session
- If CLAUDE.md exists, mention it in the Summary so the next session knows to read it
- Use absolute paths relative to project root for any file references
