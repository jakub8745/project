# Codex Engineering Instructions

## Principle: Preserve future-proof archives

Treat an archive as the durable source of truth for reconstructing the work,
not as a snapshot of the current app. Keep its structure, object index,
metadata, provenance, rights, and reconstruction intent together in one
authoritative, technology-neutral configuration wherever practical. Reference
preserved assets by stable content identifiers. Do not make current software,
services, or a generated runtime file the only place where essential meaning
or reconstruction rules exist. A future implementation should be able to use
the archive with different tools and recover the intended work and experience.

## Core principle: FIX the problem

When asked to fix a bug, regression, or incorrect behavior, you must fix the
actual underlying problem.

Do not merely make the visible symptom disappear.

A task is NOT complete if the problem is only hidden, bypassed, suppressed,
masked, or moved somewhere else.

Do not claim that something is fixed unless you have verified that the
underlying cause has been corrected and the expected behavior actually works.

## Before changing code

For every non-trivial bug:

1. Reproduce or trace the reported behavior as far as the available environment
   allows.
2. Identify the code path responsible for it.
3. Determine the root cause before choosing the fix.
4. Inspect related code to understand whether the problem exists elsewhere.
5. If the user says something worked previously, investigate it as a regression.
   Use git history/diffs when useful to understand what changed.
6. Check for existing implementations, utilities, configuration, or abstractions
   before introducing new ones.

Do not start by adding conditionals or fallbacks just because they make an
error disappear.

## Fix root causes, not symptoms

Prefer correcting the existing implementation over layering additional logic
on top of incorrect behavior.

Do NOT:

- hide errors without fixing their cause;
- swallow exceptions just to remove console errors;
- add arbitrary fallback values to make the UI appear correct;
- add retries to compensate for incorrect request/loading logic;
- disable functionality to avoid triggering a bug;
- hardcode values that should come from the existing data/model/configuration;
- duplicate an existing implementation;
- create a second source of truth;
- add special-case conditionals when the shared logic is what is broken;
- strip or transform incorrect data at the presentation layer when the wrong
  data source is being selected upstream;
- add CSS overrides to hide a rendering/layout problem whose cause is elsewhere;
- report success simply because the project builds or the error is no longer
  visible.

A workaround is acceptable only when the underlying issue genuinely cannot be
fixed within the scope of the task. If that happens, explain the limitation
clearly instead of presenting the workaround as a complete fix.

## Keep the architecture clean

Every fix should leave the affected area at least as clean as it was before.

Prefer:

- one clear code path;
- one source of truth;
- existing abstractions over duplicated logic;
- removing obsolete logic instead of keeping old and new implementations;
- correcting data at the appropriate layer;
- small, understandable changes with clear responsibility.

Avoid unrelated refactoring, but if the root-cause fix makes an old workaround,
duplicate branch, or obsolete code unnecessary, remove it.

Do not preserve broken architecture merely to minimize the number of changed
lines.

## Investigate regressions

When the user says:

- "this worked before",
- "we fixed this already",
- "this has come back",
- "it looks reverted",

treat the issue as a possible regression.

Investigate previous working code and relevant git history before implementing
a new solution.

Determine:

1. What behavior previously worked?
2. How was it implemented?
3. What changed?
4. Was the previous fix removed, bypassed, or made ineffective?
5. Should the correct previous behavior be restored, or does the current
   architecture require a cleaner implementation?

Do not create a second independent fix without understanding the first one.

## Related bugs

If multiple reported problems may have the same root cause, investigate them
together before making separate changes.

Do not create several local patches for symptoms produced by one shared bug.

Fix the shared cause and then verify each reported symptom independently.

## Verification is mandatory

Do not say "fixed", "resolved", "working", or equivalent merely because code
was changed.

Before considering a task complete:

1. Verify the original reported behavior.
2. Verify the expected behavior after the change.
3. Check the relevant related code paths.
4. Run the most relevant available tests.
5. Run type checking, linting, and/or build checks when applicable.
6. Check for runtime errors where the environment allows it.
7. Review the final diff for accidental complexity, duplicated logic,
   temporary code, and unnecessary changes.
8. Remove debugging code, temporary logging, experimental flags, and obsolete
   workarounds introduced during investigation.

Compilation/build success is necessary when applicable, but it is NOT proof
that the reported bug is fixed.

If you cannot actually verify some aspect of the fix in the available
environment, explicitly say:

"Implemented, but not verified: <what could not be verified>"

Do not represent an unverified assumption as a verified fix.

## Final response requirements

For bug-fixing tasks, finish with a concise report containing:

### Root cause
What was actually causing the problem.

### Fix
What was changed and why this fixes the underlying cause.

### Verification
What was actually tested or checked.

### Not verified
Anything that could not be verified in the current environment.

Do not invent successful test results.

Do not say tests passed unless they were actually run and passed.

Do not say the UI/runtime behavior is fixed if you only verified compilation.

## Project-specific files

`SOUL.md` contains application-level AI personality/prompt content used by
the application. It is NOT a Codex development instruction file.

Do not modify `SOUL.md` unless the user's task explicitly requires changes to
that application's AI behavior or prompt.

## Definition of done

The goal is NOT:

"The error disappeared."

The goal is:

"The reason the error existed has been understood and corrected, the intended
behavior works, related behavior has been checked, and the code has not been
made more fragile or unnecessarily complicated."

Never trade correctness and maintainability for the appearance of completing
a task.
