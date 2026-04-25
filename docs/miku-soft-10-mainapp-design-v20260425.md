# Miku Software Main Application Design v20260425

This memo organizes design characteristics commonly seen across the software series whose names start with `miku`.

The initial versions of these tools were created by `Mikuku` and Toshiki Iga.

The current contents are based on this repository and public `igapyon` GitHub repositories checked on 2026-04-25.

## Design Summary

The `miku` software series can be summarized as follows.

> A family of small, local-first conversion / bridge tools that turn existing domain files into AI-friendly, script-friendly, human-reviewable structured outputs.

What characterizes this series is not a specific technology stack or UI style. It is a repeated set of product constraints.

- Keep each tool small enough to understand
- Run locally whenever possible
- Expose structured data
- Make AI and automation easier
- Do not pretend to replace full specialist software
- Prefer practical conversion and review workflows over visual fidelity

## Role of This Document

This document is not a strict specification for any individual repository. It is a cross-repository memo that organizes design decisions common to main applications in the miku software series.

This document separates the following levels.

- **Cross-cutting principles**: design policies that should generally be kept for new main applications and major feature additions.
- **Recommended conventions**: implementation, distribution, and documentation shapes that make maintenance easier when shared across many main applications.
- **Observed tendencies**: design habits and decisions visible in existing miku repositories.
- **Product-specific notes**: design decisions for specific products, recorded as concrete examples of the cross-cutting principles.

When a specification is unclear, read the cross-cutting principles before individual implementation convenience. However, the way a principle appears can differ depending on each product's canonical source, target format, users, and existing assets.

This document is not a replacement for README files. A README is the user-facing entry point, individual files under `docs/` are detailed technical specifications, and this document is a higher-level memo for aligning design decisions across the series.

## Scope

The series whose names start with `miku` includes small tools such as the following.

Main applications:

- `miku-abc-player`
- `miku-docx2md`
- `miku-indexgen`
- `miku-unicode-guard`
- `miku-xlsx2md`
- `mikuproject`
- `mikuscore`

Java straight-conversion versions:

- `miku-indexgen-java`
- `miku-xlsx2md-java`

Agent Skills versions:

- `mikuproject-skills`
- `mikuscore-skills`

Projects with the `-java` suffix are positioned as straight Java conversions of the original suffixless tools.

Projects with the `-skills` suffix are positioned as Agent Skills versions that make the original products easier for AI agents to use.

Main applications in the miku series, excluding Java versions and Agent Skills versions, are generally implemented as Node.js applications. When they have a Web UI, they use the `lht-cmn` Web Components as shared UI components.

## Shared Direction

This series is naturally understood as a set of small, practical bridge tools.

Each tool converts, extracts, inspects, or normalizes existing files or domain data, then bridges that information into forms that humans, scripts, and AI agents can handle more easily.

The shared direction is as follows.

- local-first processing
- small and understandable implementation shape
- machine-readable output
- data exchange that is easy to pass to AI agents
- human-readable companion output when useful
- no server dependency for core functionality
- reproducibility where practical

## Role of Main Applications

In this document, a main application means an application in the miku series that is neither a Java straight-conversion version nor an Agent Skills version, and that uses Node.js as its basic runtime.

Main applications may be Web UI applications, CLI-only applications, or applications that provide both. A Web UI is common but not required. A CLI-only tool such as an index generator is still a main application when it stands as the primary product, accepts real local input, and produces verifiable artifacts.

Main applications are practical tools for safely reading existing files in a local environment, structuring them, and passing them to another representation.

Main applications are not mere demos or libraries. They should stand as products that have a UI or CLI directly usable by humans, accept real files as input, and produce verifiable artifacts.

At the same time, main applications do not aim to fully replace specialist software. Their primary role is to stand between existing specialist software, file formats, AI agents, and scripts, then bridge information into easier-to-handle forms.

## Cross-Cutting Principles

miku main applications emphasize the following cross-cutting principles.

1. Handle inputs locally, and do not make server communication a prerequisite for core functionality.
2. Do not aim to fully replace specialist software; make format bridging and inspection the main role.
3. Choose a canonical source or semantic base for each target domain, and do not confuse it with derived views.
4. Prefer reusable structured output and traceability over perfect visual reproduction.
5. Make unconvertible content, fallback, loss, and unsupported areas visible as diagnostics.
6. Push processing called from UI, CLI, tests, and Agent Skills toward the same core as much as possible.
7. Treat AI agents and scripts as first-class users, and do not make them depend on brittle screen operations or string parsing.
8. Make artifacts savable, comparable, and rerunnable as files.

The following sections elaborate these cross-cutting principles from the viewpoints of data design, conversion quality, distribution, UI, CLI, and individual products.

### Basic Philosophy of Main Applications

Main applications emphasize the following philosophy.

- Process input files on the user's machine
- Complete processing without sending files to a server
- Keep Web UI applications distributable as Single-file Web Apps
- Extract as much semantic structure as practical from existing files
- Prefer reusable structured output over perfect visual reproduction
- Provide representations that both AI agents and humans can verify
- Do not hide unconvertible content or lost information
- Keep implementation small, understandable, and maintainable
- Implement core processing from scratch where practical
- Add dependencies only when the user value and maintenance reason are clear
- Respect both automation-friendly CLI usage and human-checkable UI usage

The value of a main application is not universality. It is the ability to reliably run a specific conversion, extraction, or inspection workflow locally.

### Common Principles for Main Applications

Main applications use the following principles as defaults.

- Use Node.js as the basic runtime
- Use `lht-cmn` Web Components when a Web UI exists
- Distribute Web UI applications as Single-file Web Apps
- Do not require server communication for core functionality
- Accept input from local files, CLI arguments, or standard text/JSON representations
- Generate output as files that are easy to pass to other tools, such as Markdown, JSON, XML, SVG, XLSX, or ZIP
- Build UI flow around load, preview, diagnostics, and export
- Make CLI usable for batch processing, tests, and AI agent workflows
- Make major artifacts savable as files
- Treat warning, diagnostics, and summary as structured data where possible
- State conversion limitations and unsupported areas clearly
- Try to obtain the same output from the same input and same settings

Main applications keep the user flow short: load, verify, export, and pass to another tool or AI.

### Scratch Implementation and Dependency Principles

Main applications implement core processing from scratch where practical.

This does not mean that external libraries must never be used. In cases such as `mikuscore`, third-party libraries may be necessary because of domain complexity or the need to connect with existing assets.

External libraries are also appropriate when specification compliance is too large or risky for a small tool, when implementing the behavior ourselves would create security risk, or when integration with an existing ecosystem is the main user value. Examples include complex media rendering, archive or cryptographic correctness, format parsing whose edge cases are security-sensitive, and domain-specific engines maintained by a broader ecosystem.

However, the central conversion policy, data model, diagnostics, output assembly, and AI-facing view generation should remain under our control as much as possible.

This principle appears in decisions such as the following.

- Do not delegate the meaning of conversion entirely to an external library
- Read and write the necessary parts of file formats ourselves where practical
- Even when ZIP input/output is needed, avoid heavy general-purpose libraries if the use case is limited
- Even when Excel input/output is needed, avoid handing the whole process to large libraries such as Apache POI; handle the required workbook structure on the miku side
- Implement XLSX, XML, SVG, Markdown, JSON, and similar generation with a clear scope limited to the purpose
- Use third-party libraries to realistically reduce implementation burden or compatibility risk, not to hide general processing
- Place miku-series data models and diagnostics around adopted libraries
- Be cautious about adopting dependencies when they make output or behavior opaque

Even when `mikuproject` handles ZIP or XLSX-like artifacts, the core assembly should remain understandable. Even for Excel input/output, processing should not be handed wholesale to comprehensive libraries such as Apache POI; the required workbook structure should be handled on the miku side. Even when `mikuscore` needs third-party libraries around music formats or rendering, the miku-side value should remain in format bridging, diagnostics, normalization, and handoff to AI workflows.

The point of reducing dependencies is not simply to reduce package count. It is to keep the meaning, constraints, and failure modes of processing understandable and explainable to users and AI agents.

### Data Design Principles

Main applications emphasize internal and output data design.

In particular, they prioritize the following ideas.

- Place a canonical format or semantic base for each target domain
- Treat surrounding formats as views derived from that canonical format
- Separate human-facing output and AI-facing output when useful
- Make JSON easy for AI and programs to handle
- Use Markdown as context that humans can read and AI can also consume
- Treat SVG, XLSX, ZIP, and similar formats as artifacts or reports
- Expose warnings and loss that occur during conversion as diagnostics

Data design prefers meaningful structure, diffability, reuse, and reimportability over visual reproduction.

### Canonical Source, Primary Output, and Derived View Principles

Main applications declare what they treat as the canonical source for each target domain and design around it.

The canonical source is the semantic center that the application must preserve. In extraction tools, it is often useful to call the original file or data being extracted the canonical input. The primary output is the artifact the user mainly wants from the tool, such as Markdown, JSON, XML, SVG, XLSX, or ZIP. Derived views are additional surfaces generated from the canonical source or from the primary output for inspection, handoff, reimport, or reporting.

Input/output, internal models, UI, CLI, AI-facing views, and report outputs are positioned to preserve the canonical source and transfer its meaning to other uses.

Examples:

- `mikuscore` treats MusicXML as the semantic anchor
- `mikuproject` treats MS Project XML as the semantic base and uses `ProjectModel` internally
- `miku-xlsx2md` treats the Excel workbook as the canonical input, and Markdown as the primary extracted representation for design-document structure
- `miku-docx2md` treats the Word document as the canonical input, and Markdown as the primary extracted representation for document structure

Use-specific views are placed around the canonical source.

- Markdown, SVG, and XLSX reports for humans
- Projections, draft views, task edit views, and phase detail views for AI
- Workbook JSON, patch JSON, summaries, and diagnostics for reimport and comparison
- ZIP bundles for distribution and handoff

The important point is not to confuse canonical source, canonical input, primary output, and derived views. Primary output is allowed to be the main user-visible result without becoming the canonical source. Derived views are useful work surfaces, but they should be generated only within the range that does not break the semantic center. When reimport is possible, the affected range must be explicit.

When a design decision is unclear, prefer the option that best preserves the meaning of the canonical source. Appearance, convenient editing surfaces, and AI handoff are important, but they should not take priority when they would lose the meaning of the canonical source.

### Product Boundary Principles

Main applications clarify what the tool does and, just as importantly, what it does not do.

Examples:

- `mikuscore` is a score converter / handoff tool, not a powerful notation editor
- `miku-abc-player` is a playback-first / preview-first ABC-centered app, not a broad score conversion workbench
- `miku-xlsx2md` aims to turn design-document structure into Markdown, not to reproduce Excel appearance
- `mikuproject` bridges MS Project XML with WBS / AI / reports, and does not replace every project-management feature

This boundary is reflected in README, docs, UI copy, and CLI help. Even if a capability exists internally, it should not be placed too prominently if it is not central to the product.

### Conversion Quality Principles

Main applications do not evaluate conversion quality only by whether the result looks similar.

The important axes are as follows.

- Do not drift unnecessarily away from the semantic center or canonical format
- Preserve existing information first, and do not over-infer ambiguous information
- When full fidelity is difficult, make loss, fallback, and unsupported areas visible as diagnostics
- Give conversion results traceability, leaving clues back to the original file / sheet / range / anchor / node
- In round trips, prioritize semantic and structural stability over whitespace identity
- For conversions that can round-trip, include round-trip cases in tests and verify that the original semantic structure can be recovered
- Keep conversion bounded and local, avoiding unrelated global rewrites
- Treat failing operations atomically so they do not leave partially broken state

Quality assurance uses unit tests, golden tests, fixtures, and regression cases to fix quality while increasing known edge patterns.

### Display Value and Internal Value Principles

Main applications distinguish between values humans see and values kept internally.

For conversions such as `miku-xlsx2md`, standard output is biased toward Excel display values. This is because, when humans share existing file contents with AI, it is important that the values seen on screen and the values in Markdown are close.

At the same time, raw values, resolution paths, fallback reasons, and unsupported reasons are kept as internal information or diagnostics when needed.

This principle satisfies both of the following.

- Humans and AI can more easily share the same visible interpretation
- Implementers and automation tools can trace the origin of values and conversion decisions

### Small Impact Radius Principles

Main applications separate the impact radius of import, edit, and AI integration.

Representative categories are as follows.

- `replace`: replace the whole state
- `merge`: reflect only limited columns or limited regions into the existing state
- `patch`: validate and apply only local differences returned by AI or similar tools

When safely modifying existing data, local projections and patches are preferred over whole replacement. Inputs passed to AI are also cut down into necessary overviews, task edits, phase details, and similar small pieces rather than whole bundles.

This design keeps AI context small, makes returned changes easier to validate, and makes diffs easier for humans to review.

### Artifact Pipeline for Generative AI Interactive Tools

For miku software such as `mikuproject` and `mikuscore`, which have generative AI interaction or AI agent workflows, AI integration is not treated merely as a convenient UI feature. It is designed as a pipeline with intermediate artifacts.

Inputs passed to AI, outputs returned by AI, validation results, applied state, and diffs are each made into units that can be saved, inspected, and rerun.

A representative flow is as follows.

- Output an AI-facing projection from the target state
- AI returns structured JSON such as a draft, edit view, or patch
- Validate the returned JSON's kind, schema, reference IDs, and impact radius
- Apply only what passes validation to the state
- Diff the applied state against the original state
- Expand into human-facing artifacts such as XML, XLSX, Markdown, or SVG when needed

This property does not appear with the same intensity in every miku main application. In tools whose main purpose is extraction or conversion, such as `miku-xlsx2md` and `miku-docx2md`, AI-readable output and diagnostics are central. In tools that edit existing state through interaction with AI, projection, patch, validate, apply, and diff move closer to the center of the product workflow.

This pipeline may fit CLI and Agent Skills better than Web UI. When intermediate artifacts are JSON and staged validation or diff review is important, CLI and Agent Skills should be treated as regular paths rather than making the UI too heavy.

Web UI is useful as a lightweight entry point for creating projections, checking import results, previewing, and downloading. The center of AI editing, however, is the ability to handle saved projections, patches, diagnostics, and diffs in order.

## Recommended Conventions

The following sections turn the cross-cutting principles into practical repository operations. They do not force every product into exactly the same shape, but new implementations and cleanups should first consider this shape as the default.

### Distribution and Build Principles

For main applications with a Web UI, split development-time source files from distribution-time single-file artifacts.

Distribution artifacts should generally be designed as Single-file Web Apps. They should open in a Web browser, require no additional installation or server startup, and allow core functionality to be used offline.

For Web distribution, the basic structure is to place `index.html` as a landing page and launch the actual main HTML from it. The main HTML is generated as a product-named single-file app, such as `miku-xlsx2md.html`, `miku-docx2md.html`, `mikuproject.html`, or `mikuscore.html`.

The landing page generally displays the build date. Links from the landing page to the main HTML include URL parameters such as the build date so old single-file apps are less likely to be opened from the browser cache.

The basic shape is as follows.

- Place TypeScript source under `src/`
- Edit source template HTML
- Treat `index.html` as the landing page
- Display the build date on the landing page
- Generate the main HTML as a product-named single-file app
- Add cache-busting parameters to URLs from the landing page to the main HTML
- Bundle CSS / JS / required assets into a single HTML file during build
- Do not directly edit generated single HTML artifacts
- Make generated artifacts work as offline runtime
- Keep required JS / CSS local or vendored
- Make builds locally deterministic

This shape balances development-time maintainability with ease of distribution for users.

### `workplace/` Directory Principles

The repository root of a main application contains a `workplace/` directory for local work.

`workplace/` is a place for generated artifacts, temporary files, local verification data, local run results, and similar files. The directory itself is kept with `.gitkeep`, but its contents are generally outside git management.

The expected repository shape is to keep `workplace/.gitkeep` under version control and ignore normal contents below `workplace/` through `.gitignore`. If a product needs a checked-in sample or fixture, it should be placed under an explicit fixture or docs directory rather than hidden inside `workplace/`.

`workplace/` is not included as input or an inspection target for standard test, lint, or release checks. However, it may be used at the end of a build as an output destination for artifacts generated by the current product itself. This directory may contain sibling repository clones, real documents, verification outputs, and similar files; if standard commands pick them up, quality checks for the current product become mixed with the state of the local verification environment.

The name is standardized as `workplace`. If past text or typos use `workspace`, those references should be moved to `workplace` over time.

### Role Split Between README and docs

`README.md` is an entry document for ordinary users.

README should mainly contain the following.

- What the software does
- Representative usage
- Installation or startup method
- Major inputs and outputs
- Major options
- Links to additional information

Developer details, design memos, internal structure, implementation specifications, test policy, and future notes are stored as Markdown under `docs/`.

README may link to `docs/`, but its body should stay as the first explanation users read. Do not make README too heavy with internal design or developer details.

### Managing External-Publishing Documents Under `docs/articles`

Main applications may place drafts and outlines for external publishing under `docs/articles/`, separate from user-facing README and developer-facing docs.

`docs/articles/` is not the product specification itself. It is a working area for organizing product introductions, development experience, implementation knowledge, and problem awareness for external media. Original manuscripts, article notes, outlines, and drafts for published articles are kept as Markdown.

The basic shape is as follows.

- Separate directories by medium
- Use one Markdown file per article by default
- Keep pre-publication thinking as Markdown
- Keep original manuscripts or supplementary notes for published articles when useful
- Provide article templates that organize topic, intended reader, constraints, and related links
- Use filenames that expose date and topic, such as `YYYYMMDD-topic-outline.md`, `YYYYMMDD-topic-draft.md`, or `topic-memo.md`

The roles of media-specific directories are also separated.

- `docs/articles/qiita/` contains articles for developers or technically interested readers, such as technical background, implementation policy, usage, constraints, and development logs
- `docs/articles/note/` contains articles that emphasize narrative flow, such as background, problem awareness, experience, and thinking

This separation keeps technical articles and experience articles from mixing too much, even when they discuss the same subject. For example, feature introductions and Markdown output specifications for `miku-xlsx2md` can be organized for Qiita, while the experience of implementing and documenting with generative AI can be organized for Note.

`docs/articles/` is not a replacement for README or specifications. Constraints, implementation knowledge, bugs, and improvement ideas found while writing articles are returned to README, formal docs, TODO, or test fixtures as needed. Article writing is external publishing, but it is also treated as a review workflow for making the product explainable.

### Task Management With `TODO.md`

In many cases, in-progress tasks, improvement ideas, unresolved topics, and next actions are recorded in `TODO.md`.

`TODO.md` is not so much a replacement for an issue tracker as it is a lightweight work memo for keeping context inside the repository.

More detailed design memos or specifications can be split into `docs/` as needed. `TODO.md` should contain short entry points to those files and lists of unfinished items.

### Exceptions and Derived Relationships

#### Exception for Derived Apps With Upstream

miku main applications generally do not have another main application as upstream.

`miku-abc-player` is a subset made by picking up ABC-related functionality from `mikuscore`. Its use of `mikuscore` as upstream is a special circumstance caused by this subset extraction. `mikuscore` itself also refers to another upstream in some parts, but this is treated as an exception among exceptions. Product-specific details for `miku-abc-player` are gathered in the product-specific notes below.

Such upstream references and derived relationships are not the standard shape for main applications as a whole.

Derived applications that exceptionally have an upstream emphasize the following.

- Keep future intake from upstream easy
- Prefer thin wrappers, thin adapters, and entry-point level customization
- Narrow feature scope through UI surface, input mode, and product messaging
- Do not delete upstream-derived code broadly only because the current UI does not use it
- Prefer ease of upstream sync over visual local cleanup
- Allow downstream-specific divergence only when the practical benefit is clear

This policy permits a little extra code only when an upstream exists. Normal main applications do not assume upstream synchronization and instead prefer a small, understandable structure aligned with the application's own purpose.

### Core and Thin Entry Principles

Main applications push processing called from UI, CLI, tests, and Agent Skills toward the same core as much as possible.

CLI and Web UI are designed as thin entry points that call a shared core, not as separate implementations.

This principle appears in forms such as the following.

- Separate the body of conversion, inspection, normalization, import, and export from UI
- Implement CLI as a thin wrapper around core
- Let Web UI display core results and handle file selection and saving
- Write tests not only for UI but also for core APIs
- Provide small public entry points that Agent Skills and external automation can call easily
- Use the same defaults, diagnostics, and output policy in Web UI and CLI

When adding a thin layer to publish a CLI, keep that layer responsible for option parsing, file I/O, stdout / stderr, and exit codes. Do not duplicate conversion meaning or business logic on the CLI side.

### Public API Surface Principles

Main applications provide a UI-independent public API surface when needed.

The public API surface does not expose everything inside the application. It gathers operations needed by Agent Skills, CLI, tests, MCP, or future integrations as small, stable entry points.

The public API surface emphasizes the following.

- Provide format-aware import / export entry points
- Put verification operations such as validate, summarize, diff, and apply on the core side
- Make AI-facing specs and projections stably retrievable
- Do not depend on UI DOM state
- Structure input, output, and diagnostics
- Do not turn the detailed internal module graph into an external contract

This policy lets features built for Web UI be used with the same meaning from CLI and Agent Skills.

### Runtime Difference Adapter Principles

Main applications may run in both Web browsers and Node.js CLI.

In that case, runtime-specific parts such as DOM, XML parser, file, Blob, download, encoding, and ZIP saving should not be scattered directly through core logic.

Runtime differences are contained in adapters or loaders as follows.

- Use browser standard APIs on Web
- Inject required APIs through loaders or adapters in Node.js
- Do not hard-code XML DOM or serializer to a global
- Treat file I/O and download as separate responsibilities
- Let core pass around bytes, text, document objects, and structured data

This separation makes it easier to use the same core in both Single-file Web Apps and CLI.

### Diagnostics and Summary Principles

Main applications treat diagnostics and summaries as formal output surfaces, not as byproducts.

Diagnostics are not mere error messages. They are information for users, developers, and AI agents to trace conversion decisions, fallback, unsupported areas, loss, warnings, suspicious input, and output constraints.

Summaries are used to quickly understand the whole input or conversion result.

The principles are as follows.

- Diagnostics have code / message / severity / source location where practical
- Source location is kept in a form suited to the target domain, such as file / sheet / range / anchor / node / command
- CLI can output diagnostics to stderr or as structured diagnostics
- Web UI provides a place to inspect diagnostics and summaries
- AI-facing workflows use diagnostics as material for patch validation and diff decisions
- Unsupported information is not silently discarded; it is kept as trace or metadata when useful
- To keep normal primary output readable, detailed trace is emitted in debug / diagnostics mode
- Debug trace is not a replacement for the body; it is supporting information for tracing conversion decisions and lost information

This makes it possible to judge not only whether conversion succeeded, but also how trustworthy it is and where constraints remain.

### Option and Mode Principles

Main applications avoid adding too many options and modes.

However, important trade-offs that users must choose because of the target conversion should be exposed as modes.

Examples:

- display / raw / both
- plain / github
- balanced / border / planner-aware
- replace / merge / patch
- diagnostics text / json

When adding a mode, satisfy the following.

- It is explainable what the mode switches
- The meaning is aligned between UI and CLI
- The default is appropriate for normal use
- The mode can be traced from output filenames or summaries
- Tests fix representative cases for each mode

Modes are placed for users to choose conversion policy, not to expose internal convenience.

### UI Design Principles

Main applications with a Web UI use `lht-cmn` Web Components to keep consistency across the series.

UI is centered on the actual work surface rather than an explanatory landing page.

The basic UI flow is as follows.

- Load an input file
- Run conversion or analysis
- Inspect results, summaries, and diagnostics
- Save required artifacts

The UI clearly treats processing as local so users do not mistakenly think their files are being sent to an external server.

Even when a Web UI exists, the center of the main application is not the UI itself. It is the processing that reads local files, structures them, and outputs artifacts. Avoid states whose meaning exists only in the UI.

- Do not create important information that exists only in UI state
- Do not trap core logic inside DOM event handlers
- Make the same processing callable from CLI and tests
- Use UI copy to clarify product boundaries
- Separate the landing page as an entry point from the main HTML as the work surface

For this reason, miku main applications prefer reliable operations on real files and verifiable outputs over visual luxury.

### CLI Design Principles

Main applications with a CLI consider both batch workflows that replace manual work and invocation from AI agents.

CLI emphasizes the following.

- Keep commands and options few
- Make input and output files explicit
- Output artifacts to stdout or specified files
- Treat warnings and diagnostics as stderr or structured diagnostics
- For long-running processing or processing where progress matters, make progress and timing output available through `--verbose` or similar options
- Make success and failure judgeable by exit code
- Make the same operation reproducible in tests and CI

CLI is not a helper for UI. It is a formal entry point for AI agent workflows and automation.

As in `miku-indexgen --verbose`, target, output destination, current scan location, discovered files, and timing breakdowns are emitted incrementally when useful, rather than only summarized at the end. This lets humans and AI agents notice stalls, incorrect target ranges, or unexpected input earlier during processing.

This kind of progress / timing output is not confused with primary output or structured diagnostics. Artifacts remain stable through file or stdout contracts; incremental logs use an easy-to-identify prefix such as `verbose:`, and representative lines are fixed in tests.

## Common Patterns Observed Across the Series

The following sections are not specifications for individual products. They organize tendencies observed across existing miku repositories. They are not as strong as cross-cutting principles, but new main applications should first consider whether the same shape can be reproduced.

### AI and Automation as Users

AI agents and programs are treated as first-class users.

This is explicit in `miku-indexgen`: it is described as a tool for AI agents and programs to get an overview of available files before reading full file contents.

Across the series, this appears in forms such as the following.

- JSON views for AI handoff
- Markdown output as model-readable context
- Diagnostics and summaries for downstream tools
- `*-skills` repositories that teach AI agents how to use tools
- CLI surfaces that allow scripted use without depending on browser UI

The design preference is not merely to produce human-readable output. It is to keep structures simple enough for other programs and agents to use without brittle parsing.

### Local-first and Privacy

Many tools run in the browser or as local CLI.

This is important because input files often contain private or business-sensitive data.

Representative inputs include the following.

- Excel workbook
- Word document
- project plan
- score file
- source repository

Across the series, core functionality does not assume hosted backends or server communication. Single-file Web Apps and local CLI keep processing complete inside the local environment by default.

### Prefer Conversion Over Full Editing

These tools usually do not try to replace full-featured specialist applications.

Examples:

- `mikuscore` is a score conversion and inspection tool, not a full engraving editor.
- `miku-xlsx2md` extracts meaningful workbook content as Markdown rather than perfectly reproducing Excel appearance.
- `miku-docx2md` is not a Word layout engine; it extracts document structure as Markdown.
- `mikuproject` bridges MS Project XML, WBS reports, AI JSON, and visual output, but does not replace every project-management feature.

The repeated pattern is not to promise complete round-trip fidelity. It is to preserve or expose meaningful structure and make information lost during conversion visible.

### Canonical Format, Primary Output, and Companion Format

Some projects choose a canonical format or central format and place companion formats around it.

Examples:

- `miku-indexgen`: flat `index.json` is canonical. `index.md` is optional companion output.
- `mikuscore`: MusicXML is the central interchange format.
- `mikuproject`: MS Project XML is the semantic base. AI JSON, workbook JSON, XLSX, Markdown, SVG, and Mermaid are surrounding views.
- `miku-xlsx2md`: the Excel workbook is the canonical input. Markdown is the primary extracted text representation. Assets and summaries are companions.
- `miku-docx2md`: the Word document is the canonical input. Markdown is the primary extracted text representation. Assets and summaries are companions.

This design supports the formats needed for human verification and tool exchange while keeping the core model simple.

Artifacts are separated by role.

- primary output: the conversion result the user mainly wants. Examples: Markdown, XML, XLSX, SVG.
- companion summary: a summary for quickly inspecting the input or conversion result.
- sidecar asset: supporting files referenced by the primary output, such as images, attachments, or split outputs.
- manifest: a machine-readable index of sidecar asset paths, media types, source traces, location information, and similar data.
- debug / diagnostic trace: fallback, unsupported, and loss tracking information that is too detailed for normal output.

When sidecar assets are emitted, a manifest is attached where practical. This does more than save files; it helps downstream tools and AI agents reinterpret which input element each asset came from and how it is referenced from primary output.

### Small Tool Shape

This document organizes shared design information across the miku software series, not development notes specific to an individual repository.

Across the series, tools are kept small and direct.

- Keep the whole project small enough to understand
- Minimize dependencies
- Prefer machine readability over human-facing decoration
- Prefer structures that make downstream automation simple
- Use straightforward input/output through CLI arguments and generated files

Implementation shape differs by project, but the basic product shape is small, readable, and easy for other tools to call.

### Browser and CLI Combination

Several projects combine a browser UI with a CLI path.

Excluding Java versions and Agent Skills versions, main applications use Node.js as the basic runtime. Even when a Web UI exists, build, CLI, tests, and distribution artifact generation are centered on the Node.js toolchain.

Web UI uses `lht-cmn` Web Components to keep a common look and operation feel across the series. App-specific UI is added minimally on top.

Browser UI is suited for the following.

- Interactive local conversion
- Preview
- Human inspection
- Download of generated artifacts

CLI is suited for the following.

- Batch conversion
- Tests
- Agent workflows
- Integration with other tools
- Reproducible command-line use

This combination allows the same core functionality to be used for both human work and automated workflows.

### Naming Pattern

The `miku` prefix indicates this series of small tools.

Names include both hyphenated names such as `miku-indexgen` and `miku-xlsx2md`, and non-hyphenated names that start with `miku`, such as `mikuscore` and `mikuproject`.

The `-java` suffix indicates a Java straight-conversion version, and the `-skills` suffix indicates an Agent Skills version of the original product.

Many repositories also have the `mikuku` topic, which appears to identify the broader software family.

### License Choice

`miku` repositories consistently use Apache License 2.0.

This is positioned as a practical default for small reusable tools and companion libraries.

## Observed Main-Application Character

In addition to technology choices, miku main applications share common habits in how they are built. This section names tendencies observed from existing products so they can be reused in future specification work.

### Center Artifacts

Main applications are designed around savable artifacts rather than screen state or temporary operation results.

Artifacts should be usable later in the same way by users, CLI, tests, AI agents, and other tools.

For this reason, the following are emphasized.

- Major results can be output as files
- Output filenames and formats are predictable
- Results seen in UI and results obtained by CLI do not diverge in meaning
- Summaries, diagnostics, and manifests inspected in UI and saved by CLI come from the same core
- Generated files can be placed under work areas such as `workplace/`
- Input, mode, diagnostics, and summary can be traced from artifacts

UI is an operation surface for producing artifacts, and CLI is an entry point for generating artifacts automatically. Both are aligned as different entry points to the same processing result.

### Inspect Before Handoff

Main applications do not treat conversion as the end. They emphasize workflows where humans or AI inspect conversion results before passing them onward.

For this reason, output may include not only a single final file but also summaries, diagnostics, previews, and companion outputs for inspection.

This idea appears as follows.

- Do not simply push conversion results directly into external tools
- Provide human-judgeable Markdown, SVG, XLSX reports, and similar outputs
- Pass input structure and constraints to AI as summaries before AI handles details
- Pass AI-returned changes through validate, diff, and patch
- In areas that can round-trip, verify in tests whether they can be converted back

This does not mean that AI or automation is not trusted. The design places inspectable structure before and after automation.

### Keep Distance to the Canonical Source Short

Main applications avoid drifting too far from the canonical source even when adding convenient views or editing surfaces.

AI-facing JSON, Markdown, reports, previews, and patches are surfaces for easier work. They are not the canonical source itself.

For this reason, avoid the following.

- Editing only a derived view and leaving the path back to the canonical source unclear
- Over-shaping data for AI convenience and losing constraints from the original data
- Distorting the canonical format or internal model to prioritize UI appearance
- Over-completing input-side meaning for the convenience of conversion results

What is needed is to create human- and AI-friendly surfaces while separating what came from the canonical source from what is derived, inferred, or auxiliary.

### Keep Input and Output Straightforward

Main applications avoid relying too much on complex project state or implicit work environments. They keep the relationship between input files and output files straightforward.

Typically, they prefer the following shape.

- Explicit input file or input directory
- Explicit output directory when needed
- Explainable generated file types
- Clear meaning for stdout, stderr, and exit code
- Rerunnable with local files only
- Same command reproducible in CI and local tests

This straightforwardness applies not only to CLI but also to Web UI. In Web UI, the flow should remain short: load, inspect, save.

### Keep Intermediate Representations Small

Main applications avoid making internal models or AI-facing projections into huge models that fully reproduce the entire target domain.

They provide intermediate representations for extracting necessary meaning, but those representations are not full clones of the target domain. They are limited to the range the product needs.

This policy preserves the following.

- Implementers can understand the whole
- JSON passed to AI agents does not become overly large
- Patch and diff impact radius can be limited
- Unsupported information is not forced into the internal model
- Added features do not unnecessarily fatten the canonical source or core model

Even when the target domain is complex, the miku-side intermediate representation is designed according to the range the product takes responsibility for.

### Include Failure in the Specification

Main applications treat failures and partial support as part of the specification, not only successful output.

File conversion inevitably encounters inputs that cannot be fully supported. In such cases, the design should not silently discard information, approximate vaguely, or warn only in UI.

The principles are as follows.

- Emit unsupported as unsupported
- Preserve fallback reasons when fallback occurs
- Show loss when loss exists
- Treat suspicious input as warning
- Attach source location when possible
- Keep normal output at a granularity that does not obstruct reading, and increase trace in debug mode
- Fix not only success cases but also failures, warnings, and partial support in tests

By structuring failure information, humans can judge more easily and AI agents can choose next operations more safely.

### Return Real-Data Observations to Fixtures and Specifications

Main applications emphasize returning differences and bugs found in local real data to fixtures, tests, docs, and TODO, rather than ending with one-off fixes.

Real data often contains private or business-sensitive content, so it may not be placed directly in shared fixtures. Even then, the observed feature should be reduced into a minimal `.xlsx`, `.docx`, XML, JSON, or similar fixture and brought into tests in a reproducible form.

This policy appears as follows.

- Organize focus areas using real data outside git management
- Do not expose real-data filenames or contents too much in public docs
- Reduce found problems into minimal fixtures
- Do not leave absolute paths, creators, modifiers, creation timestamps, external links, or unnecessary embedded information in fixtures
- Connect fixtures with test names, specification topics, and the symptoms they mainly verify
- Return design decisions learned from real-data observation to README, docs, and TODO

This flow makes quality checks shareable and reproducible while still allowing tools to be local-first and handle private data.

### Preserve Reproducibility Down to Output Bytes

Main applications emphasize reproducibility of saved artifact bytes where practical, not only appearance or strings.

Especially when generating ZIP, XLSX, Markdown, SVG, JSON, and similar outputs, the priority is to obtain artifacts that are easy to compare from the same input and same settings each time.

This policy appears in decisions such as the following.

- Fix metadata unrelated to content, such as ZIP entry timestamps
- Make output filenames predictable from input name and mode
- Avoid automatically increasing mode suffixes too much; put necessary mode information in summaries or metadata
- Explicitly handle save-time settings such as encoding, BOM, line endings, and escaping
- Share the same save-processing layer across browser UI, CLI, and Markdown inside ZIP
- Treat runtime-unavailable encoding or save features as constraints rather than silently approximating them

Reproducibility is not only for easier testing. It lets AI agents and scripts diff artifacts, judge changes, and reprocess only what is necessary.

### Stage Fallback

When main applications handle complex input formats, they do not aim for complete compatibility from the start. They use the most reliable information first and stage fallback when something cannot be resolved.

Representative ideas are as follows.

- Prefer saved confirmed values or canonical data inside input files when available
- Limit in-house parsers / evaluators to ranges that need missing-value handling or completion
- Keep older resolvers or compatibility paths as safety nets in some cases
- When resolution fails, preserve the original formula, raw metadata, and unsupported reason
- Make fallback events traceable through diagnostics or summaries

This design avoids expanding into a complete reimplementation of the target format while reducing practical information loss.

## Product-Specific Notes

This section records how cross-cutting principles appear in individual products. These notes are not the formal specifications of each product; they are memos for organizing design boundaries.

### Notes Specific to `mikuscore`

`mikuscore` is a score converter / handoff tool that uses MusicXML as its semantic anchor. It is positioned as a main application for handing score data among notation software, interchange formats, AI generation workflows, and human preview.

For this kind of tool, the following boundaries are especially important.

- Treat MusicXML as the central interchange format, and do not drift conversion or generation meaning away from the MusicXML structure unnecessarily
- Treat ABC, MEI, MuseScore, MIDI, SVG, PNG, AI JSON, and similar formats as import / export / preview / handoff views around MusicXML
- Do not aim to be a powerful notation editor or engraving editor; make conversion, inspection, normalization, and verification before and after specialist editors the main role
- Place preservation of existing information first, and do not over-infer ambiguous durations, voices, ties, accidentals, ornaments, or layout information
- For inputs where full fidelity is difficult, keep loss, fallback, unsupported areas, and source locations as diagnostics
- Prefer consistency among MusicXML usable by downstream tools, structured views readable by AI, and preview checkable by humans over perfect musical visual reproduction
- For AI score generation or editing, use structured intermediate artifacts such as measure details, AI JSON, diagnostics, and diffs rather than exchanging the whole score as free text
- Treat UI as an entry point for import, preview, diagnostics, export, and AI handoff, not as a score editing screen
- Treat CLI and Agent Skills as formal entry points for score conversion, validation, AI workflows, and regression tests
- Use third-party libraries to reduce the realistic burden of score rendering and existing-format connections, while placing miku-side value in conversion policy, diagnostics, normalization, and handoff models

What matters for `mikuscore` is not becoming a substitute for notation software. It is to keep MusicXML at the center, pass score data to other representations without breaking it, and let humans and AI agents verify the same conversion result.

Therefore, feature priority is judged not by whether more editing can be done on screen, but by whether MusicXML-first conversion quality, diagnostics, round-trip stability, AI handoff, and external tool integration become stronger. Strengthening saved intermediate artifacts, conversion diffs, fixtures, golden tests, and format coverage is more `mikuscore`-like than adding deep editing UI.

### Notes Specific to `miku-abc-player`

`miku-abc-player` is a special main application in the miku series. It is a playback-first and preview-first ABC-centered app derived from `mikuscore`, rather than a fully independent application designed around its own separate conversion engine.

For this kind of tool, the following boundaries are especially important.

- Treat ABC preview and playback as the product center, not broad score conversion or deep notation editing
- Accept supported non-ABC imports when they are opened into the ABC-centered workflow through inherited `mikuscore` / MusicXML-compatible processing
- Keep inherited edit and export surfaces secondary, even when they remain available because preserving them reduces implementation or sync cost
- Reuse `mikuscore` project structure, build model, UI conventions, ABC-related logic, playback logic, and lightweight edit / export surfaces where doing so keeps upstream intake practical
- Prefer thin adapters, profile-like configuration, entry-point customization, UI visibility controls, and product wording over downstream rewrites of shared conversion behavior
- Do not delete upstream-derived code broadly only because the current `abc-player` UI does not expose all of it
- Treat changes to ABC parsing, ABC / MusicXML round-trip behavior, diagnostics, playback, and shared UI/runtime assumptions as upstream-sensitive changes
- When local divergence becomes substantial, prefer asking for a general `mikuscore` profile / option hook rather than adding `abc-player`-specific fork logic
- Keep user-facing messaging centered on load, preview, play, and small correction workflows

What matters for `miku-abc-player` is not becoming a smaller clone of all `mikuscore` features. It is to provide a fast local ABC playback and preview entry point while staying close enough to `mikuscore` that improvements to shared score handling can continue to flow into the derived app.

Therefore, feature priority is judged by whether the app becomes better at opening ABC, showing it, playing it, and safely inheriting upstream score-processing improvements. Preserving an easy upstream sync path can be more `miku-abc-player`-like than aggressively removing unused inherited surfaces for local neatness.

### Notes Specific to `mikuproject`

`mikuproject` is a project bridge tool that connects `MS Project XML` as its semantic base with WBS, generative AI, human-facing reports, and visual outputs. For this kind of tool, the following boundaries are especially important.

- Treat `MS Project XML` as a near-canonical semantic base, and use `ProjectModel` internally as a neutral representation
- Treat `.xlsx` and workbook JSON as surrounding representations for verification, visualization, and limited editing, not as replacement canonical sources for `MS Project XML`
- Treat `WBS XLSX`, `WBS Markdown`, `SVG`, and `Mermaid` as report / presentation outputs for humans, and do not confuse them with import paths
- Treat generative-AI-facing JSON as an editing representation separate from workbook JSON, and separate its purpose with an extension such as `.editjson` when useful
- For safe modification of existing WBS, prefer the local edit pipeline `project-overview -> task-edit / phase-detail -> patch_json -> validate -> apply -> diff` over whole replacement
- Allow `project_draft_view` as an entry point for drafting new plans, but treat it as a different workflow from local modification of existing WBS
- In import, make `replace / merge / patch` explicit and reject invalid combinations of `format` and `operation`
- Validate AI-returned patches for referenced tasks, updatable fields, structural changes, dependencies, assignments, and similar points before applying them
- Use `CLI` and `Agent Skills` as the main path for the AI editing pipeline; treat Web UI as an entry point for loading, projection saving, preview, download, and result inspection
- Provide small aggregation entry points as needed so the single-file web app, CLI, Agent Skills, and tests can call the same core
- Contain differences between Web browser and Node.js CLI in adapters for XML DOM, file I/O, download, encoding, and similar areas
- Align the meaning of derived artifacts from the same `ProjectModel`, such as `WBS XLSX`, `WBS Markdown`, `Daily SVG`, `Weekly SVG`, `Monthly Calendar SVG`, and `Mermaid`
- Treat `WBS SVG` not as a replacement for `Mermaid`, but as a separate preview / download output whose appearance is easier to control
- Align interpretation of date bands, business days, holidays, progress bands, and similar display semantics between `WBS XLSX` and `SVG` where practical
- Treat bundles such as `ALL` ZIP as useful for sharing and inspection, but too heavy for normal AI editing; prefer local projections first

What matters for `mikuproject` is not increasing project-management features for their own sake. It is to hand the same project information among `MS Project XML`, reports, visualization, AI editing, and CLI automation without breaking meaning.

Therefore, feature priority is judged not by whether the product approaches an MS Project replacement, but by whether bridging, inspection, local editing, diff review, and artifact generation become stronger. Strengthening saved state, limited projections, patch validation, and report export is more `mikuproject`-like than adding heavy UI-contained editing features.

### Notes Specific to `miku-xlsx2md`

`miku-xlsx2md` is a design-document conversion tool that extracts Excel `.xlsx` into Markdown. For this kind of tool, the following boundaries are especially important.

- Do not make complete reproduction of Excel screen layout, cell widths, colors, borders, or shape placement the primary goal
- Treat `.xlsx` as `design document structure extraction -> Markdown`, extracting prose, tables, images, links, formula results, and auxiliary metadata
- Convert the whole workbook, and do not assume manual sheet-by-sheet copy-and-paste
- Prefer display values close to what humans see in Excel as the default for Markdown body text
- Track raw values, formulas, resolution paths, and fallback reasons as internal information or diagnostics rather than in the body text
- Do not rely only on Excel table definitions for table detection; also use borders, value density, connected components, header-like features, planner / calendar layouts, and similar clues
- For layout-centered sheets, prefer decomposing into sections, narrative, tables, images, charts, and shapes rather than absorbing the whole sheet into one huge table
- Do not aim for a fully Excel-compatible formula evaluator; reduce information loss in the order `cached value -> AST evaluator -> legacy resolver -> fallback_formula`
- Separate rich text modes into `plain`, which drops decoration, and `github`, which moves toward GitHub Markdown plus some HTML
- Prefer extracting semantic metadata from charts over image reproduction, and treat shapes as source data or SVG assets where practical
- Bundle Markdown and assets as ZIP, and make image or shape assets referenceable from the body by relative paths
- Treat save-time byte-level reproducibility, such as ZIP entry timestamp, Markdown encoding, and BOM, as part of the conversion specification

This policy avoids expanding into redrawing Excel as another Excel-like view, and keeps focus on document content, table structure, auxiliary information, and AI handoff.

### Notes Specific to `miku-docx2md`

`miku-docx2md` is a document conversion tool that extracts Word `.docx` into Markdown. For this kind of tool, the following boundaries are especially important.

- Do not make complete reproduction of Word page layout, floating objects, shape positioning, text box placement, or headers / footers the primary goal
- Treat Markdown as the primary output for reading document structure and body text
- Track embedded images and other binary content with sidecar assets and manifests rather than fully repositioning them in the body
- Make unsupported Word elements inspectable through summaries or debug HTML comment traces without polluting normal Markdown body text
- Preserve image alt text, relationship targets, document positions, and similar data as companion metadata usable by AI and downstream scripts

This policy avoids expanding into reimplementing the `.docx` layout engine, and keeps focus on extracting document content, order, headings, lists, tables, links, and image references into a locally reusable form.
