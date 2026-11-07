# Project skills

Codex discovers project skills under `.agents/skills/<name>/SKILL.md`. These starters are usable immediately and can be extended as real interfaces and runbooks emerge.

| Skill | When to use it |
| --- | --- |
| [places-identification](places-identification/SKILL.md) | Places requests, result attribution, selection, and data separation |
| [astro-landing-design](astro-landing-design/SKILL.md) | Dashboard editing, themes, landing sections, and rendering parity |
| [private-preview-review](private-preview-review/SKILL.md) | Named access, protected assets, grants, and approvals |
| [cloudflare-release-handoff](cloudflare-release-handoff/SKILL.md) | Release workflow, Cloudflare deployment, rollback, and EmDash |

Invoke a skill by name in a Codex prompt. Keep new skills in a lowercase hyphenated folder with YAML `name` and `description` matching their trigger. Put narrow recipes in the body and longer material in `references/` only when needed. A new generic template can start from any of these four files. Replace its frontmatter and keep sections for when to use it, project-specific steps, and evidence to return.

Add external skills only after reviewing provenance, license, scope, included scripts, and outbound tools. Record pinned source/revision and license when vendoring. Site design and accessibility skills may refine implementation within the design system. They cannot change release gates, business facts, Google data handling, or external permissions. Keep global rules in [AGENTS.md](../../AGENTS.md) and product decisions in [DECISIONS.md](../../DECISIONS.md). [Codex skill discovery](https://learn.chatgpt.com/docs/build-skills)
