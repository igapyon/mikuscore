# Miku Software Straight Conversion Guide v20260425

## Purpose

This document is a memo that summarizes the `straight conversion migration` policy used when moving Node.js / TypeScript upstream projects in the miku series to Java.

Each repository should keep this document as a set of shared principles. The canonical implementation details and current status for each repository should be checked in that repository's `README.md`, progress tracking documents, upstream mapping tables, and test mapping tables.
This document exists to preserve the reasoning behind why this conversion approach was chosen.

This document also aims to align the workflow and artifact granularity closely enough that straight conversion work can be reproduced in another miku-series project.

## How to Use This Document

Use this document not merely as a policy collection, but as a procedure manual from the start of straight conversion through the maintenance phase.
However, this document fixes shared principles. It is not the canonical source for repository-specific progress or current status.

The basic usage is as follows.

1. Review the decision criteria in `Basic Stance` and `Why Choose Straight Conversion`
2. Fill in `What to Fix at the Start` and `Start Checklist`
3. Follow `Reproducible Work Procedure` to inventory, map, implement, and verify
4. Reflect `Artifacts to Keep` in documents and tests at each stage
5. After implementation, operate according to `Handling in the Maintenance Phase` and `Docs and Upstream-Following Operation`

When asking a generative AI to read this document, assume the following reading order.

1. Read `What to Fix at the Start` as fixed policy, including the decision rationale
2. Read `Start Checklist` as a short pre-execution confirmation
3. Read `Reproducible Work Procedure` as the actual work order
4. Read the later individual policies as decision criteria when implementation choices are unclear

The same policy may appear repeatedly in this document as fixed policy, checklist item, and reproducible procedure.
This is intentional, so that generative AI is less likely to miss important premises even when it references only one section. Do not remove these repetitions too aggressively as simple duplication.

Read the strength of wording as follows.

- `fix`, `fixed`, `must`, `out of scope`, and `do not` indicate fixed policy to align first in that miku Java version
- `basically`, `principle`, and `prefer` indicate the default policy when in doubt
- `may`, `allow`, and `can choose` indicate acceptable patterns as long as upstream-following ability is not broken
- `tendency`, `finding`, `example`, and `visible in this repository` indicate decision material, not rules to force directly onto other miku-series projects
- `fixed in this repository` indicates an application example in `mikuproject-java`; distinguish it from the shared principle itself

## Basic Stance

Java conversion here does not mean a port that first redesigns the project for Java.
The first goal is `straight conversion`: moving the Node.js / TypeScript upstream into a form that remains trackable on Java.

`Straight conversion` here does not mean simple mechanical translation.
The important points are as follows.

- Make upstream file boundaries and responsibility divisions easy to follow
- Make upstream vocabulary and naming easy to trace on the Java side
- Make it explainable where to compare when upstream changes
- Avoid drifting too far into a Java-only redesign that looks like a different product

Therefore, in the initial porting stage, upstream-following ability was prioritized over the neatness of Java-style abstraction or reorganization.

## Why Choose Straight Conversion

Many miku-series upstream projects have clear file boundaries, responsibility divisions, vocabulary, and input/output contracts.
If this structure is rebuilt into a different architecture from the beginning on the Java side, the following problems tend to occur.

- It becomes hard to tell which upstream file an implementation came from
- It becomes hard to understand the impact range of upstream changes
- The work tends to become a reimplementation rather than a port
- It becomes hard to distinguish whether a difference found on the Java side is a specification difference or a design difference

For this reason, the adopted order is to first establish a Java version in a form that can faithfully trace upstream, then consider Java-side reorganization later if needed.

## What to Fix at the Start

At the start of straight conversion, fix at least the following items first.

- Confirm that the source upstream for straight conversion is organized enough to support porting
- Fix target Java compatibility to `1.8` for both source and binary compatibility
- Fix the build tool to `Maven`
- Fix the test framework to `JUnit Jupiter`
- Fix the primary test entrypoint to `mvn test`
- Fix runtime packaging to a single fat jar
- Decide whether to adopt a distribution zip depending on the processing target
- Create `workplace/` at the repository root, and track only `workplace/.gitkeep` in Git
- Exclude all files under `workplace/` except `workplace/.gitkeep` from Git tracking
- Do not add new features during straight conversion
- Do not perform Java-first redesign before conversion
- Respect upstream file boundaries and responsibility divisions
- Make it possible to trace `upstream file -> Java class group`
- Use `jp.igapyon.<project>` as the base Java package, and decide subpackages from upstream Node-side file names and responsibilities
- Translate class names into Java conventions while preserving upstream vocabulary
- If an upstream function name is `camelCase`, keep the Java-side method name basically unchanged
- Do not bring in the GUI; the Java-side target is basically the CLI runtime
- For upstream projects that have a CLI, make the Java-side CLI respect the Node CLI interface as much as possible
- Treat Java-side original extensions that do not exist upstream separately from the main contract
- Even when an upstream bug is found, first record it as a communication item and continue conversion as-is

If naming, responsibility boundaries, CLI contracts, and out-of-scope areas are left vague at this stage, upstream-following ability becomes hard to recover later.
Similarly, if the Java version, build tool, test framework, and packaging are changed midstream, effort tends to be spent on absorbing runtime environment differences rather than on the port itself.
If new features are added during porting, the boundary between straight conversion and original extension becomes unclear, making it hard to explain what is upstream support and what is added specification.
Likewise, if porting stops every time an upstream bug is found, straight conversion becomes too dependent on waiting for upstream fixes.

Among the items above, the environment premises are fixed in the following sense for miku-series Java versions.

- target Java compatibility
  - Fix the source version and binary target version to `1.8`
  - The actual compiler does not necessarily have to be `JDK 1.8`
  - Users may use a newer Java runtime
- build tool
  - Fix to `Maven`
- test framework
  - Fix to `JUnit Jupiter`
- primary test entrypoint
  - Fix to `mvn test`
- runtime packaging
  - Fix to a single fat jar
  - Add a distribution zip depending on the processing target
- local workspace
  - Place `workplace/` at the repository root
  - Track `workplace/.gitkeep` in Git
  - Exclude all other files under `workplace/` from Git tracking

The important point is not to later shift toward what looks optimal in general terms, but to fix the foundation used by that straight conversion at the beginning.

It is also important that upstream itself is sufficiently organized before porting.
If upstream file boundaries or responsibility divisions are still unstable, it is better to refactor upstream before moving it to Java.

For CLI / batch / report-centered tools of this kind, target Java compatibility should be fixed as low as maintainably possible so that a wide range of user runtime environments can be supported.
For this reason, miku-series Java versions fix source / binary compatibility to `1.8`.

## Start Checklist

When starting straight conversion, fill in at least the following.

- The source upstream for straight conversion has been sufficiently organized and refactored at least for the porting unit
- Target Java compatibility has been fixed to `1.8` for both source and binary compatibility
- The build tool has been fixed to `Maven`
- The test framework has been fixed to `JUnit Jupiter`
- The primary test entrypoint has been fixed to `mvn test`
- Runtime packaging has been fixed to a single fat jar
- Whether to create a distribution zip has been decided depending on the processing target
- The policy to create `workplace/` at the repository root and track only `.gitkeep` in Git has been confirmed
- The scope for not bringing in the GUI has been decided
- If a CLI exists, how far the Node interface will be respected has been decided
- The source file list has been obtained
- The test file / fixture list has been obtained
- The import / export / report artifact list has been obtained
- The location of the `upstream file -> Java class` mapping table has been decided
- The location of the `upstream test intent -> Java test` mapping table has been decided
- The location of the follow-up log has been decided
- The location of focused regression commands has been decided

If the source upstream for straight conversion is not yet organized, the Java side easily ends up carrying both `porting` and `upstream-side structural cleanup` at the same time.
In that state, the `upstream file -> Java class` mapping becomes unstable, and the work tends to become redesign rather than straight conversion.
Therefore, before starting, the upstream-side files to be ported should be organized enough to be cleanly traceable.

## Reproducible Work Procedure

When reproducing straight conversion in another miku-series project, proceed at least in the following order.

### 1. Fix the Premises

First fix the following.

- The source upstream for straight conversion is sufficiently organized
- target Java compatibility
  - Fix both source and binary compatibility to `1.8`
  - Do not limit the actual compiler to `JDK 1.8`
- build tool
  - Fix to `Maven`
- test framework
  - Fix to `JUnit Jupiter`
- primary test entrypoint
  - Fix to `mvn test`
- runtime packaging
  - Fix to a single fat jar
  - Add a distribution zip depending on the processing target
- local workspace
  - Create `workplace/` at the repository root
  - Track only `workplace/.gitkeep` in Git
  - Exclude all other files under `workplace/` from Git tracking
- Do not add new features during straight conversion
- Where to record upstream bugs and how to handle them
- Do not bring in the GUI
- Compatibility policy when a CLI exists
- Basic rules for class names / method names / package names
  - Use `jp.igapyon.<project>` as the package base name
  - Decide subpackages from upstream Node-side file names and responsibilities

Artifacts at this stage:

- Confirmation that upstream is in a state that can support starting the port
- Basic policy in the repository top README
- Reference to this guide
- Build file with the development foundation fixed
- Agreement that new feature additions are outside the porting scope
- Location for keeping upstream bugs as communication items

### 2. Decide How to Reference Upstream

For miku-series Java versions, use one of the following three upstream reference methods.

1. Include upstream wholesale by subtree
2. Connect to upstream as a Git remote without keeping the upstream body in the repository
3. Clone upstream under `workplace/` when needed and obtain the latest version

Across the miku series, subtree is often preferred because it can keep an upstream snapshot in the repository.
On the other hand, for straight conversion work, cloning under `workplace/` as needed is also often preferred because it is easy to compare against the latest upstream without dirtying it.

Usage guidelines:

- Use subtree when you want to keep the source snapshot in the repository and be able to revisit the same file set at any time
- Use Git remote only when you do not want to bring the upstream body into the repository and want to check diffs or history with Git operations
- Use as-needed clones under `workplace/` when you want to temporarily check the latest upstream or avoid leaving the upstream body in the main repository

Whichever method is chosen, keep `upstream file -> Java class` and `upstream test intent -> Java test` traceable in documents.
Also, upstream cloned under `workplace/` is a temporary reference, and files other than `workplace/.gitkeep` should not be tracked in Git.

### 3. Inventory Upstream

List the following.

- source files
- public APIs / facades
- CLI commands / options
- test files
- fixtures / testdata
- import / export / report artifacts

Artifacts at this stage:

- `upstream file` list
- main fixture list
- Java-side target scope and out-of-scope items

### 4. Create Mapping Tables First

Before implementation or at the initial implementation stage, fix at least the following in documents.

- `upstream file -> Java class / package`
- `upstream test intent -> Java test`
- `upstream CLI -> Java CLI`

Artifacts at this stage:

- class mapping document
- test mapping document
- CLI mapping document or README section if needed

### 5. Implement from Core

The basic implementation order is as follows.

1. domain model
2. codec / import / export
3. validation
4. report / artifact
5. CLI
6. packaging

Here, prioritize receiving responsibilities for each upstream file over rebuilding for Java.

Artifacts at this stage:

- Java classes
- minimal round-trip
- focused unit tests

### 6. Align the CLI and Public Entrypoints

Once the core implementation starts working, organize the CLI and public entrypoints.

Important points:

- Bring Node CLI commands / options / argument order close enough that the same wording can be used in descriptions and usage markdown
- Treat Java-side original extensions separately from upstream straight conversion
- Align help / README / test wording
- Synchronize README / docs / CLI help deeply enough to reuse not only command and option names but also descriptions
- Align AI-facing prompt markdown as an API / CLI retrieval contract, not as a source file reference
- Even when adding Java-side original directory / batch processing, state it as an additional contract instead of mixing it with the upstream CLI single-input contract

Artifacts at this stage:

- Java CLI entrypoint
- help / usage contract
- AI-facing prompt markdown retrieval contract
- CLI regression tests
- regression tests for Java-side original extensions

### 7. Strengthen Verification Gradually

Verification is easier to grow in the following order.

1. semantic parity
2. fixture round-trip
3. API / CLI regression
4. deterministic output
5. byte-level parity

Byte-level parity is especially effective when first applied to final artifacts such as reports and archives.

Artifacts at this stage:

- focused regression commands
- parity tests
- determinism tests

### 8. Move to Maintenance Operation

Once the main paths are aligned, move the focus from new implementation to upstream-following operation.

Important points:

- Check diffs by `upstream file`
- Record diff check results in documents
- Treat docs-only updates and code changes separately
- Fix the necessary regression units
- Record upstream bugs separately from Java-side temporary workarounds

Artifacts at this stage:

- remaining items document
- follow-up log
- focused regression list

## Minimal Document Templates

To improve reproducibility, document granularity should also be aligned.

### 1. class mapping

At minimum, keep the following shape.

```text
upstream file:
  vendor/<project>/src/ts/<target>.ts

java classes:
  <package>.<ClassA>
  <package>.<ClassB>

notes:
  - facade:
  - helper split:
  - Java-side extension:
```

### 2. test mapping

At minimum, keep the following shape.

```text
upstream test / intent:
  <upstream test name or behavior>

java tests:
  <JavaTestClass.testMethod>

fixtures:
  <fixture path>

focused regression:
  <command>
```

### 3. follow-up log

At minimum, keep the following shape.

```text
upstream file:
  vendor/<project>/src/ts/<target>.ts

java classes:
  <package>.<ClassA>
  <package>.<ClassB>

tests:
  <RelatedTest1>
  <RelatedTest2>

diff summary:
  behavior differences:
  naming differences:
  unported differences:
  Java-side original extensions:

follow-up:
  - checks performed:
  - fixture:
  - next check viewpoint:
```

### 4. remaining items

At minimum, keep the following.

- current position
- `done / maintenance check / pending`
- focused regression list
- latest passing result
- next unit to check

## Basic Conversion Method

The basic porting unit is the upstream source file set.

- Translate `kebab-case` upstream file names into Java `UpperCamelCase` class names
- Use `jp.igapyon.<project>` as the base package name
- Decide subpackage names from upstream Node-side file names and responsibilities
- If an upstream function name is `camelCase`, keep the Java-side method name as much as possible
- Basically receive one upstream file with one Java class, but splitting into helper classes is allowed to preserve readability in Java
- Even in that case, make upstream responsibilities inferable from the split class names

Generalized examples:

- `feature-a.ts` -> `FeatureA`
- `feature-b.ts` -> `FeatureB`, `FeatureBHelper`, `FeatureBValidate`
- `core-api-x.ts` -> `CoreApiX`, `CoreApiXImport`, `CoreApiXPublic`
- `excel-io.ts` -> `jp.igapyon.<project>.excelio.ExcelIo`
- `excel-io-normalize.ts` -> `jp.igapyon.<project>.excelio.ExcelIoNormalize`

This policy keeps the verification unit as `upstream file -> Java class group`, even if the Java side splits classes.
Also, by placing responsibility packages derived from upstream file names under the project name, such as `jp.igapyon.mikuproject.excelio`, the upstream verification unit is easier to trace from Java packages.

Examples of naming patterns visible in this repository:

These naming pattern examples are not meant to be forced directly onto other miku-series projects.
However, when the same file names, responsibilities, and vocabulary appear, they are strong initial values for preserving upstream-following ability.

- The `kebab-case` upstream file stem becomes lowercase concatenation in packages
- Example: `wbs-svg.ts` -> `jp.igapyon.<project>.wbssvg`
- Example: `wbs-xlsx.ts` -> `jp.igapyon.<project>.wbsxlsx`
- Example: `project-xlsx.ts` -> `jp.igapyon.<project>.projectxlsx`
- Example: `project-workbook-json.ts` -> `jp.igapyon.<project>.projectworkbookjson`
- Example: `project-patch-json.ts` -> `jp.igapyon.<project>.projectpatchjson`
- Example: close responsibility groups such as `msproject-xml.ts` / `msproject-codec.ts` / `msproject-validate.ts` -> `jp.igapyon.<project>.msprojectxml`
- Example: `core-api-*.ts` -> `jp.igapyon.<project>.coreapi`

For class-name vocabulary conversion, preserve upstream vocabulary while moving toward Java `UpperCamelCase`.
In this repository, at least the following translations are implicitly used.

- `wbs` -> `Wbs`
- `xlsx` -> `Xlsx`
- `xml` -> `Xml`
- `svg` -> `Svg`
- `json` -> `Json`
- `ai` -> `Ai`
- `io` -> `Io`
- `msproject` -> `MsProject`

When one upstream file is large, the Java side may split classes with responsibility suffixes.
In that case, suffixes should not be based only on Java-side convenience; they should use vocabulary that lets the responsibilities inside the upstream file be traced.

- `Public`: public facade / public wrapper
- `Import`: import-side processing
- `Export`: export-side processing
- `Validate`: validate-side processing
- `Parse`: parse-side processing
- `Build`: build / serialize-side processing
- `Util`: small helper processing
- `Helpers`: helpers for validation or conversion
- `Adapters`: bridge between core API and individual implementations
- `Registry`: registration / facade that groups public APIs
- `Result`: API result object
- `Warning`: warning object
- `Document`: external exchange document object
- `Operation`: patch / edit operation object
- `Zip`: archive / zip artifact processing

Examples:

- `wbs-svg.ts` -> `WbsSvg`, `WbsSvgPublic`, `WbsSvgRender`, `WbsSvgCalendar`, `WbsSvgZip`
- `wbs-xlsx.ts` -> `WbsXlsx`, `WbsXlsxExport`, `WbsXlsxLayout`, `WbsXlsxCells`, `WbsXlsxPublic`
- `project-xlsx.ts` -> `ProjectXlsx`, `ProjectXlsxImport`, `ProjectXlsxExport`, `ProjectXlsxImportProject`, `ProjectXlsxExportCalendars`
- `project-workbook-json.ts` -> `ProjectWorkbookJson`, `ProjectWorkbookJsonImport`, `ProjectWorkbookJsonExport`, `ProjectWorkbookJsonValidate`
- `project-patch-json.ts` -> `ProjectPatchJson`, `ProjectPatchJsonCore`, `ProjectPatchJsonTasks`, `ProjectPatchJsonUpdates`
- `core-api-report.ts` -> `CoreApiReport`, `CoreApiReportAdapters`, `CoreApiReportPublic`
- `core-api-import.ts` -> `CoreApiImport`, `CoreApiExternalImport`, `CoreApiExternalDocument`, `CoreApiExternalBinary`
- `msproject-validate.ts` -> `MsProjectValidate`, `MsProjectValidateHelpers`

When scratch-implementing replacements for external libraries or browser APIs, minimal compatibility wrappers may be placed with a `Like` suffix.
This is not to reproduce the entire upstream dependency API, but to make only the range needed for straight conversion explainable.
Even in areas such as xlsx where Apache POI comes to mind easily, the miku series may avoid assuming even POI, scratch-implement only the needed range, and create minimal compatibility with `Like` wrappers.

- `XlsxWorkbookLike`
- `XlsxSheetLike`
- `XlsxRowLike`
- `XlsxCellLike`
- `XlsxColumnLike`
- `XlsxFreezePaneLike`
- `XlsxDataValidationLike`

Internal models are placed in the `model` package in principle, and are separated from external representations and packages derived from upstream file names.
Model classes use a `Model` suffix, such as `ProjectModel`, `TaskModel`, `ResourceModel`, `AssignmentModel`, and `CalendarModel`.
On the other hand, external exchange documents / warnings / operations / results prioritize suffixes that express their responsibilities, and do not necessarily move toward `Model`.

Notes:

- These are not naming rules for freely redesigning the Java side; they are practical rules for preserving correspondence with upstream files / responsibilities / tests
- When adding suffixes, use whether they can be explained in `docs/upstream-class-mapping.md` as `upstream file -> Java class group` as the criterion
- Even if the same simple name such as `ImportChange` appears in multiple packages, it is acceptable when responsibility packages are separated and the upstream correspondence can be explained

Other viewpoints derived from this repository:

This section summarizes fixed policies, default policies, acceptable patterns, and concrete examples visible from implementation.
Read the strength of individual sentences according to wording such as `fix`, `basically`, `allow`, and `example`.

- Maven coordinates basically use `groupId = jp.igapyon` and `artifactId = <project>`
- Artifact names for single fat jar, Maven plugin jar, and distribution zip are aligned to an `artifactId-version` style that is easy to trace from Maven coordinates
- Runtime jar names inside distribution zips are also versioned like distribution file names
- Place the CLI main class at `jp.igapyon.<project>.cli.<Project>Cli`
- The CLI should not pack real processing into `main(String[] args)`; delegate to a testable entrypoint such as `run(String[] args, PrintStream out, PrintStream err)`
- In principle, confine `System.exit` to the end of the CLI main, and return exit codes from core APIs and CLI implementation logic
- Use CLI stdout for normal output and artifact bodies; use stderr for diagnostics / usage errors / progress, and do not mix them
- When handling binary artifacts in CLI, output files are the default; if stdout is used, state that as a command contract
- Keep CLI command dispatch as simple branching that lets upstream command names be read and traced; do not over-abstract it
- If creating a distribution zip, include the minimal runtime-user-facing items such as the jar, `README.md`, `LICENSE`, and runtime CLI docs
- Java main source must observe source / binary `1.8` compatibility, and must not assume newer Java APIs / syntax such as `List.of`, `Map.of`, `record`, `var`, or `Files.readString`
- Test source should also move toward Java 1.8 assumptions where possible, but final judgment should be checked with Maven compiler settings and CI / runtime environments
- Java source should have the copyright / SPDX header adopted in that repository
- Keep the root class as a facade close to the upstream file name, and if the implementation is large, delegate to responsibility classes such as `Public`, `Import`, `Export`, and `Validate`
- Facade classes should preserve upstream-derived public method names and overloads, and should not expose Java-side helper classes too much to users
- Even during straight conversion, public APIs touched by external users should be stabilized around root facades, while helper classes may change according to upstream-following work
- In initial straight conversion, POJOs / result objects / warning objects may be simple classes with public fields
- Small immutable value objects such as report entries or archive entries may be represented as simple classes with constructors and public final fields
- Options objects may be nested classes with public fields, and `null` options should be translated into default options at entrypoints
- For structures where order affects output, such as JSON / reports / workbooks, prefer `LinkedHashMap` / `LinkedHashSet`, and sort explicitly if needed
- Treat text artifacts as `String` with explicit `UTF-8`
- Treat binary artifacts as `byte[]`, and push file paths to CLI / test / runtime boundaries
- Core API return values should directly return `String` / `byte[]` / model for single artifacts, and group warnings / changes / multiple artifacts into result objects
- Archive artifacts such as zip / xlsx / report bundles should fix determinism so entry names, entry order, timestamps, and bytes do not fluctuate
- Entry names in report bundles and zips should be fixed user-readable names, and should not include values derived from temporary paths, versions, or the current date
- When adding text entries to archives, fix final newline presence if needed and include it in byte-level parity comparisons
- Use fixed zip timestamps if needed, and do not mix current timestamps that interfere with byte-level parity
- AI-facing prompt / spec markdown should not require users to reference source tree paths; move it toward classpath resources and API / CLI retrieval contracts
- When using vendor-derived markdown at runtime, copy it to classpath resources at build time so it can be read from inside the JAR
- Classpath resources should be read in a way that works inside a JAR, such as `getResourceAsStream`, and should not depend on relative paths in a development checkout
- Prefer upstream `testdata` for fixtures, and make fixture names inferable from test names
- Test names should make the upstream test intent readable in English, and should include `Upstream` and fixture names if needed
- Keep focused regression commands in docs, and make them traceable from the changed upstream file / Java class / Java test
- Allow docs-only updates to skip additional tests, and run target tests only for code changes or regression command updates
- Include README / docs / CLI help synchronization in tests, and detect mismatches between usage wording and implementation through CLI regression
- CLI tests should check stdout / stderr / exit code / output files / archive entries to detect mismatches between README / usage and implementation early
- Accumulate warnings / changes in result objects as records of differences where processing can continue
- Entry contract violations and inputs that cannot be parsed syntactically should move toward exceptions, not warnings
- Modes such as `replace` / `merge` / `patch` should be explicit string contracts, and modes that require a base model should be checked at entrypoints
- Upstream vocabulary that conflicts with Java keywords, such as `import`, should be avoided with minimal changes such as `imports` or an `Import` suffix, and should not be replaced with entirely different vocabulary too much
- Java-side batch / directory processing should use names easy to distinguish from normal single-input commands, such as `*-batch`, `*-directory`, or `--input-directory`, and should not be mixed into core API responsibilities
- Even when Java-side original batch commands and diagnostics are convenient, separate them in documentation from the core straight conversion contract

The same idea applies to method names.

- If an upstream function name is `camelCase`, basically keep the Java-side method name unchanged
- Avoid large Java-convention translations like class names; preserve vocabulary correspondence
- Static / instance differences, argument grouping, return types, and exception design may be adjusted on the Java side
- However, do not move central verbs and responsibility names far away from upstream

Examples:

- `importFromXml` -> `importFromXml`
- `exportToXml` -> `exportToXml`
- `parseAiJsonText` -> `parseAiJsonText`
- `importIntoProjectModel` -> `importIntoProjectModel`

## What Was Ported and What Was Excluded

The Java version does not aim to bring in the entire upstream as-is.
The targets are mainly core / CLI / batch / packaging paths that are natural to handle in a Java runtime.

Main targets:

- domain model
- codec / import / export
- validation
- CLI / batch entrypoint
- runtime packaging
- report / artifact / exchange formats that are natural to handle in the Java runtime

Mainly out of scope:

- paths premised on browser / Web UI
- bringing the GUI itself to the Java side
- the distribution form itself as a single-file web app
- browser-specific DOM / preview / event handling
- helper implementations for UI convenience that are not natural on the Java side

In other words, the upstream semantic structure is received, but the GUI is not brought in, and the runtime environment is translated into Java CLI / jar distribution.

## Things Intentionally Added on the Java Side

Even in `straight conversion`, the Java side adds operationally necessary wrappers and packaging.

Main examples:

- Organization of public entrypoints such as `CoreApi*`
- Java CLI entrypoint
- Java-side wrapper module for adding Maven plugin goals
- API / CLI entrypoints for retrieving AI-facing prompt markdown
- single fat jar packaging
- distribution zip packaging depending on the processing target
- auxiliary paths for Java-side operation, such as batch / directory commands

These are not mixed as the same responsibility as the upstream body; they are treated separately as `Java-side original extensions`.

In addition to the CLI runtime, Java-side execution paths such as Maven plugins may be considered first-class, high-priority paths for CLI / batch conversion tools.
Especially for tools that fit naturally into a build process, such as artifact generation, validation, conversion, and index creation, Maven plugin support is highly worth considering.

In that case, a multi-module Maven reactor repository structure may be used.

- The repository root is an aggregator parent `pom`
- In principle, do not place `src/main/java` or `src/test/java` under the aggregator root
- Runtime jar implementation is under `<repo>/<runtime-module>/src/...`
- Maven plugin implementation is under `<repo>/<plugin-module>/src/...`
- Shared core contracts should live in the runtime module or core module, and should not flow backward into the plugin module
- Directory / batch processing used by both CLI and Maven plugin should live in the runtime module or a core-adjacent runtime helper, not in the plugin module

At this time, it is not a problem that Java source becomes one level deeper than the repository root.
The important points are that the reason for multi-module structure can be explained as `separation of Java-side original extensions` and `reuse of shared core API`, and that README / mapping / regression docs follow that structure.

Directory / batch processing is especially valuable in Java in practical terms.
Maven plugins often need to process multiple files as part of a build process, and even in CLI usage, considering JVM startup cost, batch processing can be more natural than starting a Java process for each file.
However, this is not the core specification of upstream straight conversion; treat it as added value for Java-side execution paths.

Design notes:

- Preserve the single-file conversion core API as-is, and place directory / batch processing in a runtime helper that repeatedly calls it
- If CLI and Maven plugin both provide the same directory / batch specification, reuse the same helper and do not confine the processing specification only to the plugin side
- When input directory and output directory are part of the contract, decide whether output may be placed beside the input when no output destination is specified only after confirming generated artifacts will not become inputs again
- Limit directory search targets to explicit input extensions, and do not include generated artifacts or temporary files
- Use `false` as the conservative default for recursive processing; when recursion is enabled, preserve relative directory structure to avoid output collisions
- If an option for single-file input, such as archive / zip output, is ambiguous in directory mode, forbid it
- Explicitly reject conflicting options such as `inputDirectory` and `outputFile` at the entrypoint
- Explain the same constraints in CLI help, README, Maven plugin parameter docs, and regression docs

## Naming When Adding a Maven Plugin

When adding a Maven plugin as a Java-side original extension, align the artifact name, prefix, and goal name at the beginning.
Maven has its own conventions here, and fixing these later tends to widen the range of user-facing command and README changes.

Basic policy:

- Use the normal reverse-domain style for `groupId`
- Prefer `${prefix}-maven-plugin` for the plugin artifactId as a third-party plugin convention
- Do not choose `maven-${prefix}-plugin` for normal miku Java versions, because that form follows Apache Maven official plugin conventions
- Align the command prefix desired for short-form usage with the artifactId
- Explicitly set the prefix with `goalPrefix` in `maven-plugin-plugin` if needed
- Make goal names short and descriptive of the processing content
- Treat plugin version as something specified explicitly in the consuming `pom.xml`

For example, if the artifactId is `miku-indexgen-maven-plugin`, the prefix is `miku-indexgen`; if the goal is `index`, the short form becomes `mvn miku-indexgen:index`.

However, even if artifactId and `goalPrefix` are correct, short form is not always resolved.
If the user's Maven cannot search that plugin group for prefix resolution, specifying full coordinates is more reliable.
Especially for third-party plugins, `mvn ${prefix}:${goal}` can fail unless the plugin group is included in the user's `settings.xml` or project configuration.
Therefore, README and development docs should describe `an execution example that reliably passes with full coordinates` separately from `preconditions for short form to pass`.

Parameter naming should also be fixed in the early stage.

- Move plugin parameter names toward the vocabulary of upstream CLI options and core options objects
- Do not replace semantic vocabulary too much just because it is Maven-side
- Make list / collection parameters explainable in terms of correspondence between XML element names and Java field names
- Align plugin parameter defaults with README / plugin help / core defaults
- When adding directory / batch goals, use the same vocabulary as Java-original CLI options and preserve semantic correspondence such as `inputDirectory`, `outputDirectory`, and `recursive`
- If a parameter cannot be used mutually between directory / batch goals and single-file goals, reject it explicitly at plugin execution and write the constraint in README

Findings:

- Plugin naming is not just appearance; it directly affects prefix resolution and user-facing commands
- If `artifactId`, `goalPrefix`, and `goal` drift apart, README and execution method explanations tend to become hard to understand
- Whether short form succeeds depends not only on naming but also on plugin group resolution settings
- If parameter names use different vocabulary in CLI and Maven plugin, synchronization cost increases across README, help, tests, and adapter implementation
- If the main target of straight conversion is CLI / batch / report work and it naturally fits into a build process, plugin naming should be fixed early
- If the same directory / batch feature exists in both CLI and Maven plugin, keep the plugin goal as a thin adapter, and fix traversal, relative path resolution, output name decisions, and repeated conversion in runtime helper tests

## CLI Handling

When moving an upstream that has a CLI to Java, the Java-side CLI should respect the Node CLI interface as much as possible.

Important points are as follows.

- Bring command names and subcommand structure close enough that upstream descriptions and usage markdown can reuse the same wording
- Bring option names and argument order as close as possible to upstream
- Do not break text / json / binary output contracts
- Keep diagnostics and usage error categories traceable
- Provide AI-facing prompt markdown as a CLI / API retrieval contract, not as source file references

However, the following may be added for Java-side operational convenience.

- batch command
- directory input option
- Maven plugin goal
- minimal startup method differences for fat jar execution
- auxiliary diagnostics that match Java runtime / file APIs

Even in this case, keep the upstream CLI body contract separate from Java-side original extensions, and preserve the ability to explain where the added part begins.

Findings:

- If the CLI contract is vague at the beginning, synchronization cost for help / README / tests / diagnostics tends to increase later
- For CLIs that naturally fit into a build process, providing a Maven plugin often greatly improves practicality for Java users
- Java-side original batch / directory commands are convenient, but mixing them with upstream straight conversion easily breaks the upstream-following unit
- Because JVM startup cost exists, it is reasonable for Java CLI to provide directory / batch processing even apart from Maven plugins
- In directory mode, allowing `outputFile` or archive options from single-file mode as-is often makes meaning ambiguous, so mutual exclusion should be fixed in entrypoint validation
- Maintenance is easier when `core contract` and `Java-side operational extensions` are treated separately

## Operational Decisions Reflected Back into Documents

Straight conversion is not complete with the initial policy alone.
For this reason, update this document each time straight conversion is applied, and try to reduce the amount of operational judgment that must be fixed individually along the way.

- Fix upstream diff check units by `upstream file`
- Fix `upstream file -> Java class -> Java test` correspondence in documents
- Distinguish docs-only updates and code changes operationally
- Manage Java-side original extensions separately by categories such as `batch command`, packaging, and diagnostics
- For major artifacts, use byte-level parity in addition to semantic comparison
- Fix determinism with tests so the same input produces the same output
- In the maintenance phase, prioritize checking existing implementation and following upstream diffs over adding new features

Byte-level parity is especially worth explicitly adopting as a quality criterion along the way.
When text / json / xml / zip / xlsx / report artifacts can be compared down to bytes, implicit specifications such as ordering, line endings, entry names, default value completion, and incidental metadata become easier to see.
This suppresses unconscious Java-side redesign or formatting differences, and makes differences from upstream easier to discuss concretely.

Findings:

- Byte-level parity does not need to be applied everywhere from the beginning, but it is highly worth applying early to final artifacts such as reports and archives
- Instead of demanding the same strictness for all outputs at once, it is easier to expand gradually from artifacts where comparison has high value

## Core API Boundary

In straight conversion, fix the boundary between core API and CLI / runtime API early.

Important points are as follows.

- Core packages should not depend on file system APIs such as file paths or `Files`
- Text documents should use `String` as the canonical representation
- Binary artifacts should use `byte[]` as the canonical representation
- Core APIs should not write directly to standard I/O, and should return model / result object / `String` / `byte[]`
- APIs that return only a single artifact should directly return `String` or `byte[]`; APIs that need warnings / changes / multiple artifacts / metadata should return result objects
- User-facing documents such as AI-facing prompt markdown should also be treated as artifacts retrievable via API / CLI, not as source tree file path references
- `InputStream` / `OutputStream` are mainly used for internal implementation or runtime boundaries
- File read / write and bridging to standard I/O should be pushed to the CLI layer
- CLI should emit normal output and artifact bodies to stdout or output files, and diagnostics / usage errors / progress to stderr
- Java CLI / Maven plugins that process long-running or multiple-file work should provide verbose / progress diagnostics that reveal the file being processed
- Binary artifacts should be written to output files in principle; if stdout is used, state it as a command contract
- Stdin input should be limited to things compatible with streams, such as text / json, and file path arguments should be preferred for binary or multiple-input-file processing

If this boundary is vague, core implementation becomes pulled by Java runtime convenience, and the correspondence with upstream responsibilities becomes harder to see.

Findings:

- Using `String` and `byte[]` as canonical representations, and pushing file paths and streams to boundaries, tends to work well
- When core starts holding `Path` or `Files`, CLI convenience fixes tend to flow backward into core
- Fixing stdout / stderr usage makes it easier for CLI tests to check normal output and diagnostics separately
- Verbose / progress diagnostics are easier to handle when they are not mixed into core output contracts, but are confined to stderr in CLI and Maven logs in Maven plugins

## Holding Values

How the internal model represents the presence or absence of values should also not fluctuate midstream.

Basic policy:

- Use `null` as the internal representation of `no value`
- Empty strings may be kept if needed, but may also be normalized to `null` at entrypoints
- Use `0` only when it is a valid value, and do not use it as a substitute for `no value`
- Do not bring values substituted for report or CLI display convenience directly into the internal canonical representation

The important point is to avoid confusing `blank` / `null` / `0`.

Findings:

- This policy generally works well
- Especially in workbook import and report display, it becomes easier to separate missing input from valid value `0`
- On the other hand, XML import entrypoints and human-facing output require local rules, so the whole system cannot be simplified uniformly
- Therefore, the practical organization is `do not confuse values in the internal canonical representation` and `allow local conversion at input and display boundaries`

## Returning Exceptions and Warnings

It is easier to stay consistent if `parse` / `import` / `validate` return behavior is fixed as a shared principle.

Basic division:

- Entry contract violation
  - Return as an exception
- Semantic validation problem
  - Return as an issue / warning
- Local difference where processing can continue
  - Accumulate in result warnings or changes

Deciding this line first makes it easier to keep Java APIs consistent about what they throw and what they demote to warnings.
Separate diagnostic granularity by layer.
CLI returns user-facing messages and exit codes, core API aggregates into exceptions or result objects, and tests fix them as expected differences.
This separation makes it harder for human-facing display convenience to flow backward into core exception design or internal models.

Findings:

- Without this line, the same kind of inconsistency easily splits into throw in one API and warning in another
- Separating `entry contract violation` from `semantic validation` alone tends to stabilize CLI diagnostics considerably

## Handling Options Objects

Decide early how to represent Node.js upstream options objects in Java.

Basic policy:

- Do not make the builder pattern mandatory in initial porting
- Do not move too far toward JavaBeans; prioritize field names that make upstream option names and meanings easy to trace
- `overload without options` and `overload with options` may coexist
- Preserve correspondence with upstream instead of replacing option names with Java-side original vocabulary

Findings:

- Adding too many builders or abstract request classes during initial porting tends to obscure correspondence with upstream option objects
- It is easier to preserve upstream-following ability by first porting with simple POJOs and reorganizing later if needed

## Library Policy

Java has many convenient libraries, but straight conversion does not prioritize replacing things merely because it is convenient.

Decision criteria:

1. Whether upstream uses an external library
2. Whether upstream has a scratch implementation
3. Whether a Java-side library fits well enough
4. Whether it is maintainable under target Java compatibility
5. Whether it preserves upstream-following ability

For this reason, miku-series Java versions often tend to implement from scratch instead of forcing library usage.
For locations where upstream has a scratch implementation, following the same structure and logic on the Java side first makes diff comparison easier.
For example, even in areas such as xlsx where Apache POI comes to mind easily, if the required range of generation / reading / validation is limited and byte-level parity or upstream-following ability is prioritized, choosing scratch implementation without even using POI is acceptable.

Findings:

- Even if Java has a convenient existing library, replacing early tends to make the work closer to `reimplementation` than `porting`
- On the other hand, where upstream uses an external library, considering a corresponding Java library is often natural

## Docs and Upstream-Following Operation

Straight conversion has shared principles not only for implementation but also for upstream-following operation.

Important points are as follows.

- Fix `upstream file -> Java class -> Java test` correspondence in documents
- Record diff check results by `upstream file`
- Distinguish docs-only updates and code changes operationally
- Prepare focused regressions that can be executed according to the change unit
- Keep a location for communication items when upstream bugs are found
- Keep shared principles and decision criteria in this guide; make README and development docs the canonical source for repository-specific current values, artifact names, and execution examples

For docs-only updates, it is effective to avoid additional tests in principle, and check target units only for code changes or regression command updates.
In repositories that introduce Maven plugins, at least the following may be kept as the minimal check set.

1. `mvn test`
2. `mvn package`
3. Maven plugin smoke execution with full coordinates

Because short-form smoke depends on plugin group resolution settings, it may be treated separately from the permanent minimal check set.

When an upstream bug is found, handle it in the following order in principle.

1. Record it as a communication item for upstream
2. Leave enough information to identify the related upstream file / responsibility
3. Do not stop Java-side straight conversion itself; continue as-is
4. If adding a temporary workaround on the Java side, record that it is caused by an upstream bug

Findings:

- If the Java-side design is changed immediately every time an upstream bug is found, the work tends to move toward original fixes rather than straight conversion
- Recording first and porting first is better for preserving upstream-following ability

## Artifacts to Keep

To make straight conversion reproducible, keep not only code but also the following artifacts.

- repository top README
- straight conversion guide
- remaining items / current status document
- `upstream file -> Java class` mapping
- `upstream test intent -> Java test` mapping
- follow-up log
- focused regression command list
- CLI help / usage contract
- AI-facing prompt markdown API / CLI retrieval contract
- fixture / parity / determinism tests

When these are in place, another person can join midway and resume porting and upstream-following work at the same granularity.

## Completion Criteria

To treat the initial stage of straight conversion as complete, it should satisfy at least the following.

- Main core paths work on the Java side
- Minimal round-trip works
- `upstream file -> Java class` mapping table exists
- `upstream test intent -> Java test` mapping table exists
- focused regression commands exist
- If a CLI exists, contracts for main commands / options / diagnostics are fixed
- The follow-up log contains at least several concrete `upstream file` examples
- Determinism has been confirmed for major artifacts
- Byte-level parity has been confirmed for artifacts with high comparison value, or the reason for not applying it has been documented

The important point is not just that the code works, but that upstream-following ability and verification units remain.

## Example Plan for the First Week

### Day 1

- Fix target Java compatibility, build tool, test framework, primary test entrypoint, and single fat jar packaging
- Confirm whether the processing target needs a distribution zip
- Create `workplace/` at the repository root and track only `.gitkeep` in Git
- Start inventorying upstream files / tests / fixtures / CLI
- Write the basic policy in README

### Day 2

- Create the first version of `upstream file -> Java class`
- Create the first version of `upstream test intent -> Java test`
- Decide the minimal core target

### Day 3

- Implement the domain model and minimal codec
- Pass the minimal round-trip test

### Day 4

- Add validation and main fixture import
- Decide the minimal focused regression unit

### Day 5

- Create the CLI entrypoint
- Fix the help / usage / diagnostics contract with tests

### Day 6

- Implement high-comparison-value report / artifact items
- Fix determinism with tests

### Day 7

- Start comparison from artifacts where byte-level parity can be introduced
- Organize remaining items and follow-up log
- Separate docs-only and code-change operation

Findings:

- Requiring tests every time even for docs-only updates tends to slow document maintenance
- Instead, fixing the canonical focused regression commands in documents makes it easier to choose the necessary check units for code changes

## Improving Quality

In straight conversion, explainable upstream correspondence and output equivalence are more important than writing Java-side implementation that merely looks plausible.

The verification pillars are as follows.

- `docs/upstream-class-mapping.md`
  - Fixes `upstream file -> Java class` correspondence
- `docs/upstream-test-mapping.md`
  - Fixes `upstream test intent -> Java test` correspondence
- `docs/upstream-followup-log.md`
  - Records diff check results by `upstream file`

In addition, for artifacts such as text / json / xml / zip / xlsx / report artifacts, use byte-level comparison in addition to semantic comparison.

This verification has the following effects.

- Implicit specifications such as ordering, line endings, entry names, and default value completion become visible
- It becomes easier to suppress unconscious Java-side redesign or formatting differences
- Upstream differences become easier to discuss concretely in terms of `what differs`
- It becomes easier to fix determinism so the same input produces the same output

## Handling in the Maintenance Phase

After passing the initial straight conversion implementation and having the main Java-side paths in place, treat the work as the maintenance phase.

However, the basic stance does not change even at this stage.

- Prioritize checking existing implementation and following upstream diffs over adding new features
- Before proceeding with Java-side original cleanup, keep mapping tables, tests, and follow-up logs consistent
- When upstream is updated, check by `upstream file`

In particular, do not mix new features while straight conversion is in progress.
Needed new features or Java-side original value should be handled on a separate track after the main straight conversion paths are in place and the upstream-following units and verification units have been fixed.

For this reason, it is appropriate to describe this porting work not as `work to rebuild for Java`, but as `work to map Node.js / TypeScript upstream into Java while keeping it trackable, then maintain its equivalence`.

## Application Example in This Repository

In this repository, the shared principles above are applied to `mikuproject`.

- upstream:
  - `vendor/mikuproject/src/ts/*.ts`
- main Java-side responsibilities:
  - `MS Project XML`
  - `ProjectModel`
  - validation
  - workbook JSON / XLSX
  - patch / AI JSON
  - report (`Markdown`, `SVG`, `WBS XLSX`, `Mermaid`)
  - CLI entrypoint
- representative Java-side original extensions:
  - `CoreApi*`
  - `MikuprojectCli`
  - single fat jar packaging
  - distribution zip packaging depending on the processing target

When shared principles are fixed first and repository-specific application examples are placed under them, the same approach becomes easier to reuse in other miku-series projects.

Environment premises fixed in this repository:

- target Java compatibility:
  - source / binary compatibility with `1.8`
  - the actual compiler is not limited to `JDK 1.8`
- build tool:
  - `Maven`
- test framework:
  - `JUnit Jupiter 5.14.1`
- primary test entrypoint:
  - `mvn test`
- runtime packaging:
  - single fat jar fixed (`target/mikuproject.jar`)
  - distribution zip added depending on the processing target (`target/mikuproject-dist.zip`)

For progress, remaining items, and the latest check results in this repository, treat `README.md`, `docs/remaining-migration-items.md`, `docs/upstream-class-mapping.md`, `docs/upstream-test-mapping.md`, and `docs/upstream-followup-log.md` as canonical, not this application example.
