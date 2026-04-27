# Miku Software Agent Skills Design v20260425

This memo organizes design characteristics commonly expected for Agent Skills versions in the `miku` software series.

The initial versions of the related tools were created by `Mikuku` and Toshiki Iga.

The current contents are based on current Agent Skills examples, the main-application design memo, the Java application design memo, and the straight-conversion guide checked on 2026-04-25.

## Design Summary

The Agent Skills versions in the `miku` software series can be summarized as follows.

> Agent-facing local workflow packages that make miku main applications easier for AI agents to call, while preserving upstream semantics, structured artifacts, diagnostics, and human-reviewable handoff points.

What characterizes Agent Skills versions is not a new product separate from the upstream application. It is a repeated set of constraints.

- Keep the semantic center of the upstream main application
- Make AI-agent workflows explicit and repeatable
- Prefer structured input / output over screen operation or loose prose
- Keep intermediate artifacts inspectable when needed
- Use upstream public APIs, CLI, or bundled runtime artifacts rather than duplicating product logic
- Treat the skill as a thin orchestration and guidance layer
- Distinguish conversation state from canonical source and primary product artifacts
- Package the skill so it can be installed and used locally

## Role of This Document

This document is not a detailed specification for one skill repository. Repository-specific behavior should be checked in each `SKILL.md`, README, and product-specific documents.

Use the shared design documents together as follows.

- `docs/miku-soft-10-mainapp-design-v20260425.md`
  - describes the upstream product design and semantic center
- `docs/miku-soft-20-javaapp-design-v20260425.md`
  - describes Java runtime versions when they exist
- `docs/miku-soft-30-straight-conversion-v20260425.md`
  - describes how Java versions are created from upstream main applications
- `docs/miku-soft-40-agentskills-design-v20260425.md`
  - describes how Agent Skills versions should expose miku workflows to AI agents

This document separates the following levels.

- **Cross-cutting principles**: design policies that should generally be kept for Agent Skills versions.
- **Recommended conventions**: repository, packaging, state, and documentation shapes that make maintenance easier.
- **Observed tendencies**: design habits visible in current Agent Skills repositories.
- **Product-specific notes**: design decisions for specific skill products, recorded as concrete examples.

When a specification is unclear, first check whether the decision preserves upstream meaning and improves agent-operable structured workflow. Agent convenience is important, but it should not hide unsupported behavior, discard diagnostics, or make the skill drift into a different product.

## Scope

The series whose names start with `miku` includes several related product types.

Main applications:

- `miku-abc-player`
- `miku-docx2md`
- `miku-indexgen`
- `miku-unicode-guard`
- `miku-xlsx2md`
- `mikuproject`
- `mikuscore`

Java application versions:

- `miku-indexgen-java`
- `mikuproject-java`
- `miku-xlsx2md-java`

Agent Skills versions:

- `mikuproject-skills`
- `mikuscore-skills`

Projects with the `-skills` suffix are positioned as Agent Skills versions that make the original products easier for AI agents to use.

This document focuses on Agent Skills versions. It does not define the Web UI conventions for upstream main applications, and it does not define the Java packaging conventions for Java application versions.

## Shared Direction

Agent Skills versions continue the shared direction of the miku series: small local bridge tools that convert, extract, inspect, normalize, or export domain files and domain data.

The Agent Skills version emphasizes the parts that fit AI-agent operation particularly well.

- explicit activation and usage instructions
- structured JSON, Markdown, XML, XLSX, SVG, ZIP, or similar artifacts
- local import / validate / export operations
- agent-readable diagnostics and summaries
- small projections instead of unnecessarily large state handoff
- patch / apply / diff workflows where existing data is revised
- bundled Java CLI and Node.js CLI paths where practical
- repeatable file-based operation
- skill bundles that can be installed into an agent environment

An Agent Skills version should not become a generic planner, generic converter, or autonomous replacement for the upstream application. Its value is that an AI agent can use the upstream miku product correctly with less guesswork.

## Relationship to Main Applications

Agent Skills versions are downstream of miku main applications.

The upstream main application owns the product semantics, canonical source, core conversions, output policy, and limitations. The skill owns agent-facing activation, workflow guidance, runtime discovery, state handoff, and packaging.

The preferred relationship is as follows.

- upstream main application provides core APIs, CLI, bundled runtime, or stable artifacts
- Agent Skill calls those upstream surfaces
- Agent Skill explains when to use which operation
- Agent Skill keeps intermediate JSON and file artifacts organized
- Agent Skill reports diagnostics, warnings, and hard errors in an agent-readable form
- Agent Skill does not reimplement core conversion behavior unless no upstream surface exists

If an upstream capability is missing, the preferred order is to request or implement the capability on the upstream side, expose it as a stable upstream API, and then let the skill call it. Agent Skills should not silently add upstream product capabilities on the skill side. Skill-local workaround code should be treated as temporary or product-specific, not as the new semantic center.

## Role of Agent Skills

In this document, an Agent Skill means a `miku` repository with a `-skills` suffix that packages one or more skills for agent environments.

An Agent Skill is primarily an agent-facing workflow adapter. It usually exposes one or more of the following.

- `SKILL.md` activation and operating instructions
- references for detailed workflows and examples
- local scripts for import / export / validation / report generation
- bundled upstream runtime artifacts or install-time runtime dependency
- test coverage for skill behavior and smoke paths
- distributable skill bundle or bundle zip

The Agent Skill is not primarily the browser UI and is not primarily a Java port. It can use Node.js, Java, or another runtime if that is the natural way to call the upstream product, but the skill layer itself should remain thin.

The center of an Agent Skill is reliable orchestration: determine when the skill applies, call the upstream runtime, validate or transform structured documents, preserve useful state, emit artifacts, and tell the agent what to do next without hiding important constraints.

## Cross-Cutting Principles

miku Agent Skills emphasize the following cross-cutting principles.

1. Preserve the semantic center and product boundary of the upstream main application.
2. Treat the skill as an agent workflow adapter, not as a replacement implementation.
3. Use structured artifacts and diagnostics instead of screen-driven or prose-only operation.
4. Keep skill activation explicit enough to avoid accidental takeover of generic tasks.
5. Prefer local runtime execution and file artifacts over server-dependent workflows.
6. Distinguish canonical source, conversation state, primary output, reports, and temporary handoff data.
7. Use small projections, patches, validation, and diffs for AI-assisted edits where practical.
8. Make installation, bundling, smoke testing, and upstream synchronization explainable.

### Basic Philosophy of Agent Skills

Agent Skills versions emphasize the following philosophy.

- Run product operations locally when practical
- Keep the upstream product meaning recognizable
- Use the upstream API or CLI before writing skill-local conversion logic
- Make AI-facing operations explicit
- Keep intermediate JSON internal when direct internal execution is possible
- Expose handoff artifacts when a human or upper-layer agent needs to inspect or reuse them
- Preserve diagnostics and warnings as part of the result
- Keep state and generated files easy to save, compare, and rerun
- Make skill activation narrow enough that generic user requests are not captured accidentally
- Keep `SKILL.md` concise and place detailed workflow material in references or docs

The value of an Agent Skills version is not that it can answer a domain question conversationally in a generic way. It is that it can safely drive a specific miku workflow through structured operations that are faithful to the upstream product.

### Common Principles for Agent Skills

Agent Skills use the following principles as defaults.

- Place one or more skills under `skills/`
- Put each skill's primary instructions in `skills/<skill-name>/SKILL.md`
- Keep the skill name close to the upstream product name when the product identity matters
- Require explicit product naming for skills that would otherwise overlap with generic tasks
- Keep detailed references under the skill directory or repository `docs/`
- Use Node.js when calling a Node.js upstream runtime directly is the simplest path
- Bundle both Java CLI and Node.js CLI paths as the standard future direction for miku Agent Skills
- Treat the Java CLI runtime artifact as a single jar
- Treat the Node.js CLI runtime artifact as a single JavaScript file
- Use bundled upstream runtime artifacts when local, reproducible execution and bundling need them
- Prefer upstream public APIs, stable global APIs, or documented CLI commands
- Package distributable bundles with scripts that can be tested
- Keep repository-level README user-facing and developer details under `docs/`
- Use `workplace/` for local scratch data, upstream checks, generated outputs, and verification files

These are defaults for the miku Agent Skills series. Individual products may add product-specific conventions, but should not change these foundations casually.

### Activation Boundary Principles

Agent Skills must be careful about when they activate.

Many miku domains overlap with ordinary conversation. A request mentioning planning, schedules, tabular files, score files, music, Markdown, SVG, XML, or reports should not automatically mean that a product-specific skill must take over.

The preferred activation rule is explicit opt-in.

Typical activation criteria include the following.

- the user explicitly names the upstream product or skill
- the user requests a documented product-specific workflow
- the recent conversation is already inside an explicitly activated workflow

Without an explicit trigger, the agent should answer normally or ask a brief clarifying question if using the skill would materially change the result.

Activation instructions should be written in `SKILL.md` because they are part of the skill contract, not just documentation.
Product-specific trigger words and exceptions should be recorded in each product's `SKILL.md` or product-specific notes.

### Core Runtime Principles

Agent Skills should use declared runtime artifacts before broad repository exploration.

The preferred order is as follows.

1. Read the active skill's `SKILL.md`
2. Check the bundled runtime artifacts declared by the skill
3. Use upstream public APIs, stable globals, or documented CLI/runtime flows
4. Use skill-local helpers only when they are the intended adapter layer
5. Search broadly for alternatives only when the declared runtime path is missing or unusable

This keeps agent behavior predictable. It also prevents the skill from accidentally using stale generated files, unrelated scripts, or partial local experiments.

Runtime artifact lookup should be simple and fixed. Place the single jar and single JavaScript CLI file under the skill directory, such as `skills/<skill-name>/runtime/`, and let the skill use those declared paths.

Do not create a separate skill product line only because an additional runtime path exists. When both Java CLI and Node.js CLI runtimes are available, treat them as runtime artifacts of the same normal `-skills` package. The skill name, activation rules, workflow vocabulary, artifact roles, and product boundary should remain tied to the upstream main application, not to the runtime implementation.

When both Java CLI and Node.js CLI runtime artifacts are bundled, the skill may prefer the Java CLI first for local execution. A single jar is easy to locate, smoke-test, and run in automation environments. If the Java CLI artifact is missing, cannot be invoked, or does not support the requested operation, the skill may fall back to the Node.js CLI runtime.

This runtime preference is an execution policy, not a semantic priority. The upstream main application remains the semantic center. Runtime differences should be reported as capability or compatibility diagnostics.

### AI-Facing Spec Retrieval Principles

Agent Skills should not rely on broad file search to find prompt or spec documents.

When an upstream product provides AI-facing prompts, JSON specs, schemas, workflow instructions, or similar documents, those documents should be retrievable through a stable upstream API or CLI contract.

The skill may bundle or reference those documents, but the preferred runtime path is as follows.

- Call an upstream API such as `getAiSpec()` or `getAiSpecText()`
- Call a documented CLI command such as `<product> ai spec`
- Receive `id`, `version`, `text`, diagnostics, and related metadata as structured data where practical

This keeps prompt and spec retrieval stable across repository layout changes. It also prevents skills from depending on source-tree paths, generated file names, or broad search behavior.

### Thin Adapter Principles

Agent Skills keep product logic in the upstream application as much as possible.

The skill layer may contain:

- activation rules
- workflow instructions
- operation selection
- input kind detection
- file naming conventions
- runtime path discovery
- small adapters around upstream API calls
- result formatting for the agent
- bundle-building scripts
- smoke tests

The skill layer should not contain:

- a parallel implementation of upstream conversion
- hidden product semantics that the upstream does not know
- broad UI replacement logic
- model-specific prompting logic that makes the skill unusable with another agent
- server credentials or provider-specific calling code unless the repository explicitly owns that integration

When skill-local code becomes large, first ask whether the upstream main application should expose a smaller public API.

### State and Artifact Principles

Agent Skills distinguish several kinds of data.

- canonical source or semantic base owned by the upstream product
- conversation state used by the skill or agent
- AI-facing projection or draft document
- patch or edit document returned by AI
- primary product output
- report or presentation output
- diagnostics and warnings
- temporary files and local scratch outputs

These roles should not be collapsed only because they are all represented as JSON or files.

For individual products, the conversation state may differ from the upstream semantic base. That does not make the conversation state the canonical semantic center of the product.

Similarly, two artifacts may share an extension while having different roles, such as structural exchange data and human-facing reports. Ambiguous filenames and ambiguous operation names should be avoided when identical extensions represent different artifact roles.

### AI Workflow Principles

Agent Skills should prefer structured AI workflows.

Representative operations include:

- provide a JSON spec or schema-like guide
- accept a draft document
- validate document kind and required fields
- import draft into product state
- export a small overview or detail projection
- accept a patch document
- validate patch references and impact radius
- apply patch to a base state
- return change summary, diagnostics, and updated state
- export human-facing reports

When revising existing state, prefer small projections and patches over full-state replacement where the upstream product supports them.

This has several advantages.

- AI context stays smaller
- returned changes are easier to validate
- references to existing IDs can be checked
- diffs are easier for humans to review
- accidental unrelated edits are less likely

Visible handoff is useful when the user or an upper-layer agent needs to inspect or pass data. However, when the skill can safely execute import / apply / export internally, it should not stop merely by printing intermediate JSON.

### Handoff and Agent-Internal Principles

Agent Skills may support both handoff-style and agent-internal workflows.

Handoff-style workflow:

- skill returns spec, projection, workbook, or prompt material visibly
- user or upper-layer agent passes that material to another AI turn or tool
- useful for inspection, debugging, interoperability, and early MVPs

Agent-internal workflow:

- skill keeps intermediate JSON internal when possible
- agent calls the next operation directly
- visible output focuses on result, diagnostics, artifacts, and next useful choices
- useful when the agent environment supports tool execution and state handling

Both styles are allowed. The default for mature flows should move toward agent-internal execution when it is safer and less noisy. Handoff should remain available when it improves reviewability or when the environment cannot chain operations internally.

### Error and Diagnostic Principles

Agent Skills distinguish hard errors from soft errors.

Hard errors include:

- unsupported or ambiguous document kind
- missing required base state for patch application
- syntactically invalid structured input
- missing upstream runtime
- failed import / export that prevents a valid result

Soft errors include:

- upstream warnings
- partial import where the upstream says processing can continue
- ignored unknown fields or columns
- fallback output formatting
- report simplifications

On hard error, the skill should stop the operation and report what is needed to continue. On soft error, the skill may continue and report warnings concisely with enough structure for the agent or user to understand the risk.

Diagnostics should preserve upstream messages and locations where practical. Skill-side wording should not hide upstream limitations.

### File and Workplace Principles

Agent Skills often produce state and report artifacts.

Generated files should be placed in predictable product-specific directories rather than scattered through the repository root.

Recommended local shape:

```text
<product>/
  state/
  output/ or report/
  tmp/
```

Recommended usage:

- `state/` for conversation state, draft JSON, patch JSON, workbook JSON, and similar reusable state files
- `output/` for final deliverables when the product is naturally conversion / rendering oriented
- `report/` for human-facing reports such as spreadsheets, Markdown, SVG, diagram text, and ZIP
- `tmp/` for short-lived local work

When multiple artifacts come from one run, use a common timestamp or run prefix so they can be grouped.

The repository-level `workplace/` directory remains local scratch space for development, upstream checks, generated outputs, and verification files. It should not become a source directory or a hidden place for checked-in fixtures.

### Upstream Runtime Artifact Principles

Agent Skills repositories should move toward receiving upstream main applications as runtime artifacts rather than as full upstream source trees.

The TOBE target shape is as follows.

- receive a single jar for the Java CLI path
- receive a single JavaScript file for the Node.js CLI path
- do not edit upstream source inside the skill repository
- document the artifact update procedure
- verify the received artifacts through skill smoke tests and API / CLI contract checks

Current repositories may not yet have this shape. During transition, it is acceptable for a skill repository to keep a vendored upstream source tree or a broader runtime copy when that is how the current skill works. However, this is a current-state allowance, not the target design.

Near-term maintenance should move those repositories toward the target shape: replace source-tree dependency with received single-jar and single-JavaScript runtime artifacts under the skill directory.

### Packaging and Distribution Principles

Agent Skills should be installable as local skill packages.

Packaging should include the files needed for the agent to read instructions and run intended local workflows.

As the TOBE target shape, miku Agent Skills should bundle both Java CLI and Node.js CLI paths when the corresponding upstream runtime exists or can be produced. The Java path should be represented by a single jar, and the Node.js path should be represented by a single JavaScript CLI file.

Current repositories may temporarily use broader vendored runtime contents or source-tree-derived packaging. This is allowed only as a transition state. New packaging work should move toward single-runtime-artifact handling.

The purpose of bundling both paths is not to make the skill layer heavier. It is to let an agent choose the runtime that best fits the local environment while keeping each runtime artifact simple, explicit, and reproducible.

Typical bundle contents:

- `SKILL.md`
- references needed by the skill
- skill-local scripts
- single jar Java CLI runtime when provided
- single-file JavaScript CLI runtime when provided
- upstream runtime artifacts, preferably single jar and single JavaScript CLI file
- package metadata when needed
- license files and notices as appropriate

Packaging should exclude development-only noise.

Examples:

- local scratch files
- `workplace/` contents
- temporary reports
- test output
- unrelated upstream development files if not needed at runtime

Bundle-building scripts should be deterministic enough that changes are reviewable. A zipped bundle should be created by a documented command such as `npm run build:bundle` or `npm run build:bundle:zip`.

### Testing Principles

Agent Skills use tests to preserve activation behavior, runtime wiring, structured I/O, and packaging.

Test coverage should include:

- skill smoke tests
- upstream runtime availability checks
- runtime selection checks, including Java CLI available, Java CLI unavailable with Node.js fallback, unsupported Java CLI operation with Node.js fallback, and all runtimes missing as a hard error
- representative import / export operations
- draft / patch / validate / apply operations where applicable
- diagnostics and hard-error behavior
- bundle creation
- important file naming and artifact paths

As miku Agent Skills move toward receiving upstream runtime artifacts as a single jar and a single JavaScript CLI file, the TOBE target shape is that the upstream source tree and upstream source test suite are not bundled and cannot be executed in the skill repository.

The main responsibility of the skill repository is to verify that the bundled runtime artifacts exist, can be invoked from the skill layer, expose the expected API / CLI contracts, and support the intended agent workflows.

When a failure points into the upstream product itself, fix and verify it in the upstream repository first, then receive updated single-jar or single-JavaScript runtime artifacts in the skill repository.

### Documentation Principles

Agent Skills keep README, `SKILL.md`, references, and docs roles separate.

`README.md` is the user-facing entry point. It should explain:

- what the skill package does
- how to install or build it
- how to start using the main skill
- representative operations
- runtime requirements
- where developer documents live

`SKILL.md` is the agent-facing operating contract. It should explain:

- when the skill activates
- what the skill is allowed to do
- the most important workflow rules
- runtime lookup discipline
- hard boundaries and common mistakes
- where detailed references are located

Detailed references may include:

- workflow examples
- input / output formats
- runtime API notes
- file import / export notes
- report export notes
- installation notes
- development notes

Do not make `SKILL.md` carry every product detail. It should be compact enough for an agent to read at activation time.

## Recommended Conventions

### Repository Shape

A typical Agent Skills repository has the following shape.

```text
repository root
  README.md
  LICENSE
  package.json
  docs/
  scripts/
  skills/
    <skill-name>/
      SKILL.md
      references/
      runtime/
        <product>.jar
        <product>.mjs
  tests/
  workplace/.gitkeep
```

In the TOBE target shape, runtime artifacts should be placed under each skill directory. Do not design new normal operation around root-level runtime artifacts, vendored source trees, or multiple competing runtime lookup paths. Current repositories that still use a vendored runtime tree should document that as a transition state and keep the lookup path explicit.

For example, `mikuproject-skills` should move toward this shape when both runtime paths are available.

```text
skills/
  mikuproject/
    SKILL.md
    references/
    runtime/
      mikuproject.jar
      mikuproject.mjs
```

The Java jar and Node.js CLI file are peer runtime artifacts. Their presence should not change the skill name or split the workflow vocabulary into runtime-specific skill products.

`vendor/` directories are transition-only locations for repositories that still depend on copied upstream source trees or broader runtime trees. New normal operation should not add new runtime lookup through `vendor/`. As upstream Java and Node.js CLI artifacts become available as single files, repositories should move those artifacts into `skills/<skill-name>/runtime/` and remove the vendored runtime tree.

### Skill Naming Conventions

Skill names should usually match the upstream product name.

Examples:

- `mikuproject`
- `mikuscore`

Use a more specific name only when the skill intentionally exposes a narrow subset and the product name alone would be misleading.

Avoid generic names such as `planner`, `score`, `xlsx`, or `markdown` for product-specific miku skills. Generic names make accidental activation more likely and weaken the relationship to the upstream product.

### Operation Naming Conventions

Operation names should expose artifact roles, not just file extensions.

Good operation names:

- `draft`
- `patch`
- `state`
- `<format>-import`
- `<format>-export`
- `<state-format>-export`
- `<report-kind>-export`
- `<bundle-kind>-export`

Avoid ambiguous names when the same extension has multiple meanings.

For example, if two outputs both use `XLSX` but one is structural exchange data and the other is a human-facing report, use names that distinguish those roles.

### Runtime API Conventions

Agent Skills should call stable upstream surfaces.

Preferred surfaces:

- exported Node.js modules
- documented CLI commands
- stable global APIs intentionally exposed by bundled single-file or browser-derived runtime
- Java CLI or Maven plugin when a Java version is the intended local runtime

The skill should not depend on UI DOM state, browser click sequences, or private generated internals when a public API exists.

If a stable upstream API is not available, document the dependency clearly and consider adding the needed API upstream.

### Result Reporting Conventions

Skill responses should be concise but structured.

A useful result usually includes:

- operation performed
- success or failure
- key artifact paths or artifact names
- warning count and short warning summary
- important diagnostics
- next state identifier or file path when relevant

Do not dump large JSON or generated artifacts into the conversation unless the user asked for the body or visible handoff is the intended workflow. Prefer file artifacts or concise summaries when the environment supports them.

### Bundle Script Conventions

Bundle scripts should be explicit.

Bundle scripts are packaging and verification commands for the skill package. In the TOBE target shape, they should not assume that TypeScript source, Java source, or the full upstream source tree is present in the skill repository.

The normal inputs are the skill files and the received runtime artifacts:

- single jar Java CLI runtime
- single JavaScript CLI runtime
- `SKILL.md`
- references and small skill-local scripts

Common commands:

```bash
npm test
npm run build:bundle
npm run build:bundle:zip
```

`npm test` should verify the skill layer and the bundled runtime artifact contracts. `build:bundle` and `build:bundle:zip` should assemble those files into installable skill artifacts. In the TOBE target shape, they should not compile upstream TypeScript or Java source as part of normal skill packaging.

If a current repository still compiles or copies broader upstream runtime contents as part of packaging, that can be tolerated during transition, but it should be treated as a migration item toward single jar and single JavaScript runtime artifacts.

The build script should fail when required runtime files are missing. It should not silently create a skill bundle that cannot run the documented workflow.

## Product-Specific Notes

### Notes Specific to `mikuproject-skills`

`mikuproject-skills` centers on WBS drafting, revision, import / export, and report generation through `mikuproject`.

Important design points:

- skill name is `mikuproject`
- explicit triggers include `mikuproject`, `miku project`, and documented synonyms
- activation is explicit and should not trigger from generic planning words alone
- current MVP keeps `spec`, `draft`, `patch`, and `workbook` in one skill
- conversation-boundary state is primarily `mikuproject_workbook_json`
- upstream semantic base remains MS Project XML and `ProjectModel`
- new WBS creation uses `project_draft_view`
- existing WBS revision uses local projections and `Patch JSON`
- file import / export is separate from AI draft / patch workflow
- structural workbook `XLSX` and report `WBS XLSX` must be named as different artifact roles
- report outputs such as `WBS XLSX`, `SVG`, `Markdown`, `Mermaid`, and ZIP are derived outputs
- AI JSON spec retrieval is exposed through upstream core API functions and the `mikuproject ai spec` CLI path, so the skill should prefer those contracts over file search
- declared `mikuproject` runtime artifacts are checked before broad repository exploration
- the upstream Node.js CLI runtime artifact is produced by `mikuproject` as a single `bundle/mikuproject.mjs` file and should be received by `mikuproject-skills` as `skills/mikuproject/runtime/mikuproject.mjs`
- the upstream Java CLI runtime artifact is produced by `mikuproject-java` as `target/mikuproject.jar` and should be received by `mikuproject-skills` as `skills/mikuproject/runtime/mikuproject.jar`

This skill does not aim to replace the `mikuproject` browser UI. Its center is structured AI-agent operation over the upstream product's core APIs and artifacts.

### Notes Specific to `mikuscore-skills`

`mikuscore-skills` should follow the same relationship to `mikuscore`.

Expected design points:

- skill name is `mikuscore`
- explicit triggers should name `mikuscore` or a documented `mikuscore` score workflow
- activation is explicit and should not trigger from generic music theory, generic MIDI editing, ordinary notation discussion, or format names alone
- preserve `mikuscore` product boundaries as a score conversion and AI handoff tool
- keep `MusicXML` as the canonical score source and explanation axis across format pairs
- use `ABC` for current generative-AI full-score handoff and new-score generation
- state the documented `ABC` baseline as `ABC standard 2.2`, while noting that some standard features remain partial or unimplemented
- distinguish notation source, AI-facing representation, rendered output, final deliverables, and temporary handoff data
- operation categories include `convert`, `render`, `diagnostics`, `format-guidance`, `ai-handoff`, and `workflow`
- prefer the vendored upstream CLI or documented runtime flow before broad repository exploration or generic converter logic
- in the development repository, check `vendor/mikuscore` first; in an installed bundle, check the skill-local `skills/mikuscore/vendor/mikuscore` runtime before treating the runtime as missing
- current documented conversion / render routes include `ABC <-> MusicXML`, `ABC -> MIDI`, `MIDI -> MusicXML`, `MusicXML <-> MEI`, `MusicXML <-> LilyPond`, `MusicXML <-> MuseScore`, `MusicXML -> SVG`, and `ABC -> MusicXML -> SVG`
- keep `MEI`, `LilyPond`, and other experimental paths explicitly marked as experimental when explaining them
- place default generated files under a workspace-local `mikuscore/` tree: `state/` for handoff or canonical artifacts, `output/` for final deliverables, and `tmp/` for temporary intermediates
- avoid presenting the skill as a full notation editor
- make unsupported notation, fallback, and conversion loss visible as diagnostics

The current `mikuscore-skills` repository may still bundle a vendored `mikuscore` runtime tree, including runtime dependencies, as its practical runtime source. That is acceptable as the current state when documented in README, `SKILL.md`, references, and smoke tests. The longer-term shared target remains single runtime artifact handling when upstream provides suitable JavaScript and Java CLI artifacts.

The details should be fixed in the `mikuscore-skills` repository's own `SKILL.md`, README, references, and docs.

## Maintenance Principles

Agent Skills maintenance focuses on keeping the skill aligned with upstream product behavior and agent runtime expectations.

Important maintenance questions:

- Does the skill still activate only for intended requests?
- Does the declared runtime path still exist in development and bundled installs?
- Did upstream API names, document kinds, or diagnostics change?
- Do smoke tests cover the main workflows users actually ask for?
- Does bundling include all required files and exclude local scratch data?
- Are artifact names still unambiguous?
- Are README, `SKILL.md`, references, and tests still synchronized?

When updating upstream, separate the work into:

- upstream sync
- skill adapter changes
- docs updates
- bundle verification
- smoke test results

This separation makes it easier to tell whether a change came from upstream behavior, skill orchestration, packaging, or documentation.

## Minimal Checklist for a New Agent Skills Repository

Before treating a new `-skills` repository as usable, confirm at least the following.

- Upstream product and semantic center are named
- Skill name and activation rule are fixed
- Product boundary and non-goals are written in `SKILL.md`
- Runtime lookup order is documented
- Upstream API / CLI / runtime surface is identified
- Main operations are named by artifact role
- Conversation state format is chosen, if state is needed
- Hard errors and soft errors are separated
- Generated file placement is decided
- Bundle command exists
- Smoke test command exists
- README links to developer docs
- `workplace/` is present or local scratch policy is otherwise documented

This checklist is intentionally small. The purpose is to prevent an Agent Skill from becoming an unclear collection of prompts and scripts before its relationship to the upstream product is stable.
