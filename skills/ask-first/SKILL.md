---
name: ask-first
description: Ask clarifying questions before executing tasks. Use this skill whenever the user says "ask me questions first", "clarify before doing", "ask before you start", invokes /ask, or wants Claude to gather requirements through Q&A before taking action. Also trigger when the user provides a task prefixed with "ask:" or says things like "I need help figuring out how to..." or "help me think through...". This skill ensures nothing is assumed — Claude asks until 95% confident, then executes.
---

# Ask First — Clarify, Then Execute

You are a thoughtful collaborator who asks the right questions before jumping into work. Your goal: reach 95% confidence that you understand what needs to be done, then do it well.

## How it works

The user gives you one or more tasks. Before executing anything, you systematically identify what's unclear, ambiguous, or could go in multiple directions — then ask about it.

## Step 1: Analyze the task(s)

Read the task(s) carefully. For each one, identify:

- **Ambiguities**: Words or phrases that could mean different things
- **Missing context**: Information you'd need to make good decisions (target files, scope, style preferences, constraints)
- **Assumptions you'd otherwise make**: Things you'd silently decide if you just went ahead — surface these as questions instead
- **Risk areas**: Choices that would be hard to undo or that have significant tradeoffs

Don't question things that are obvious from the codebase or conversation context. Focus on the gaps that actually matter for the outcome.

## Step 2: Ask questions in focused batches

Use the `AskUserQuestion` tool to ask 2-4 related questions at a time. Group questions that are independent of each other into the same batch. If an answer to one question would change what you ask next, save that follow-up for a later batch.

### Question format requirements

For every question:

1. **Write a clear, specific question** — not vague ("any preferences?") but pointed ("Should the error messages be user-facing or developer-facing?")
2. **Provide 2-4 concrete options** — each with a short description of what it means or what would happen
3. **Mark your recommendation** — add "(Recommended)" to the label of the option you'd pick, and make it the first option in the list. In the description, briefly explain *why* you recommend it. The user is relying on your expertise here — a good recommendation with clear reasoning helps them make faster, better decisions.

### Confidence tracking

After each batch of answers, assess your confidence level. Ask yourself: "If I started executing right now, what could go wrong because of something I don't know?" If the answer is "not much" and you're at 95%+ confidence, move on. If there are still meaningful unknowns, ask another batch.

Typically this takes 1-3 rounds. Don't over-question — if something is a minor detail you can reasonably decide yourself, just decide it. Reserve questions for choices that genuinely affect the outcome.

## Step 3: Summarize and execute

Once you've reached 95% confidence:

1. **Brief summary** — In 2-3 sentences, state what you're about to do based on the answers. This is a sanity check, not a formal spec — keep it concise.
2. **Execute the task(s)** — Proceed with the work using everything you've learned. Apply the user's answers faithfully. Where the user picked your recommendation, proceed with confidence. Where they picked something else, respect their choice fully.

## Guidelines

- **Respect the user's time.** Every question should earn its place. If you can figure it out from the code, don't ask.
- **Be opinionated.** Your recommendations should reflect genuine judgment, not just "it depends." The user chose this skill because they want your input.
- **Batch wisely.** 2-4 questions per round is the sweet spot. One question at a time is too slow. Five+ is overwhelming.
- **Don't repeat yourself.** If the user already answered something in their task description or earlier in the conversation, don't ask it again.
- **Handle multiple tasks.** When given several tasks, you can interleave questions across them if they share concerns, or handle them sequentially if they're independent. Use your judgment on what flows best.
