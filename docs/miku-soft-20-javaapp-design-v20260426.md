# Miku Software Java Application Design v20260426

This memo organizes design characteristics commonly expected for Java application versions in the `miku` software series.

The initial versions of the related tools were created by `Mikuku` and Toshiki Iga.

The current contents are based on current miku Java application examples, the main-application design memo, and the straight-conversion guide checked on 2026-04-25.

## Design Summary

The Java application versions in the `miku` software series can be summarized as follows.

> Java CLI / batch / build-tool versions of miku main applications that preserve upstream semantics, remain easy to trace back to the Node.js / TypeScript upstream, and provide local, reproducible artifact generation for automation and build workflows.

What characterizes Java application versions is not a Java-first redesign of the original products. It is a repeated set of constraints.

- Keep the semantic center of the upstream main application
- Preserve traceability from upstream files, vocabulary, CLI behavior, and tests
- Prefer CLI, batch, Maven, and jar distribution over Web UI
- Keep core processing independent of entrypoint adapters
- Make automation and build integration first-class use cases
- Distinguish upstream-derived behavior from Java-side original extensions
- Keep outputs reproducible and easy to compare

## Role of This Document

This document is not a porting procedure. The procedure for creating a Java version from a Node.js / TypeScript miku main application is described in the straight-conversion guide.

This document instead describes the resulting Java application design that should be preserved after such conversion work.

Use the three shared design documents together as follows.

- main-application design memo
  - describes the design of upstream miku main applications
- straight-conversion guide
  - describes how to create a Java version from such an upstream
- Java application design memo
  - describes how Java application versions should be shaped and maintained

This document separates the following levels.

- **Cross-cutting principles**: design policies that should generally be kept for Java application versions.
- **Recommended conventions**: implementation, packaging, testing, and documentation shapes that make maintenance easier across Java versions.
- **Observed tendencies**: design habits visible in current Java conversion work.
- **Product-specific notes**: design decisions for specific Java products, recorded as concrete examples.

When a specification is unclear, first check whether the decision preserves upstream meaning and Java-side operational usefulness. Java convenience is important, but it should not make upstream-following ability, CLI contracts, or output reproducibility unclear.

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

Projects with the `-java` suffix are positioned as Java application versions of the original suffixless tools. They are usually created through straight conversion from the Node.js / TypeScript upstream.

Projects with the `-skills` suffix are positioned as Agent Skills versions that make the original products easier for AI agents to use.

This document focuses on Java application versions. It does not define the Web UI conventions for upstream main applications, and it does not define the skill packaging conventions for Agent Skills repositories.

## Shared Direction

Java application versions continue the shared direction of the miku series: small local bridge tools that convert, extract, inspect, or normalize existing files and domain data.

The Java version emphasizes the parts that fit Java particularly well.

- local CLI execution
- batch processing
- Maven and build-tool integration
- jar-based distribution
- stable public core APIs
- deterministic artifact generation
- tests that can be run with standard Java tooling
- long-term maintainability in environments where Java is already available

The Java version should not become a different product merely because the runtime changed. It should carry forward the upstream application's canonical source, primary outputs, diagnostics, and product boundary as far as practical.

## Relationship to Straight Conversion

Most miku Java application versions are expected to start from the straight-conversion process.

The straight-conversion guide fixes the migration stance:

- do not begin with a Java-first redesign
- keep upstream file boundaries and vocabulary traceable
- keep upstream tests and Java tests mapped
- keep the Node CLI contract close where a CLI exists
- treat Java-side original extensions separately
- do not bring in the Web UI itself

This document takes those results as the foundation for Java application design.

In other words, `straight conversion` explains how the Java version is created, while this document explains how the Java version should remain understandable, useful, and maintainable after it exists.

## Role of Java Applications

In this document, a Java application means a `miku` repository with a `-java` suffix that provides a Java runtime implementation of an upstream main application.

A Java application is primarily a local execution tool. It usually exposes one or more of the following.

- CLI runtime jar
- Maven plugin
- batch command
- public core API
- deterministic file output
- distribution zip

The Java application is not primarily a Web UI application. If the upstream main application has a Web UI, that UI is generally not brought into the Java version.

The center of the Java version is reusable processing: read local input, create structured output, emit diagnostics, and make the result reproducible from CLI, tests, Maven plugins, or other automation.

## Cross-Cutting Principles

miku Java applications emphasize the following cross-cutting principles.

1. Preserve the semantic center and product boundary of the upstream main application.
2. Preserve traceability from upstream files, tests, vocabulary, CLI contracts, and artifacts.
3. Use Java as a local CLI / batch / build integration runtime, not as a reason to redesign the product first.
4. Keep core processing independent from CLI, Maven plugin, and other adapters.
5. Treat Java-side original extensions as separate contracts.
6. Prefer reproducible artifacts and deterministic tests over environment-dependent behavior.
7. Keep diagnostics, summaries, warnings, and timing output structured enough for automation.
8. Make maintenance against upstream changes explainable through mapping documents and focused regression commands.

### Basic Philosophy of Java Applications

Java application versions emphasize the following philosophy.

- Run locally without server communication for core functionality
- Keep the upstream product meaning recognizable
- Keep the Java implementation small enough to inspect
- Preserve upstream vocabulary where it helps traceability
- Use Java packaging for reliable local distribution
- Make CLI and build-tool execution first-class paths
- Keep Web UI and browser-specific behavior out of scope unless explicitly required
- Keep public entrypoints testable without invoking `System.exit`
- Generate artifacts whose names, bytes, and diagnostics are predictable where practical
- Record differences from upstream instead of hiding them inside implementation choices

The value of a Java application version is not that it is more Java-like in the abstract. It is that the upstream tool becomes easier to run, package, test, and integrate in Java-centered local and build environments.

### Common Principles for Java Applications

Java applications use the following principles as defaults.

- Use Java source and binary compatibility `1.8`
- Use Maven as the build tool
- Use JUnit Jupiter as the test framework
- Use `mvn test` as the primary verification command
- Package the runtime as a single executable fat jar
- Add a distribution zip when it helps users handle runtime artifacts
- Place runtime implementation in a runtime module when a multi-module repository is needed
- Place Maven plugin implementation in a separate plugin module when provided
- Keep core APIs callable from CLI, Maven plugin, and tests
- Keep CLI stdout, stderr, output files, and exit codes clearly separated
- Keep `workplace/` at the repository root for local upstream checkout and temporary work
- Track only `workplace/.gitkeep` under `workplace/`
- Keep upstream mapping and test mapping documents under `docs/`

These are defaults for the miku Java series. Individual products may add product-specific conventions, but should not change these foundations casually.

### Upstream-Following Principles

Java applications preserve upstream-following ability.

This means the Java side should make it easy to answer the following questions.

- Which upstream file did this Java class or class group come from?
- Which upstream test intent does this Java test cover?
- Which CLI option or behavior corresponds to the upstream CLI?
- Which behavior is an upstream-derived contract, and which behavior is a Java-side extension?
- Which focused regression command should be run after changing this area?

The following maintenance documents support that operation.

- upstream class mapping
- upstream test mapping
- upstream follow-up log
- remaining migration items

These documents are not secondary paperwork. They are part of the maintainability design of the Java version.

### Java Runtime Boundary Principles

Java versions usually receive upstream core semantics, but not the upstream browser runtime.

Main targets:

- domain model
- codec / import / export
- validation
- summary and diagnostics
- CLI entrypoint
- batch entrypoint
- Maven plugin entrypoint where useful
- report and artifact generation
- runtime packaging

Mainly out of scope:

- Web UI itself
- single-file Web App distribution
- browser DOM event handling
- browser preview surfaces
- download UI behavior
- UI-only helpers that do not represent product semantics

The Java version translates the runtime environment into CLI, Maven, jar, and file-based workflows while preserving the upstream product meaning.

### Core and Adapter Principles

Java applications keep core processing separate from entrypoints.

The preferred shape is as follows.

- core API owns product processing and output decisions
- CLI parses arguments, handles file I/O, prints stdout / stderr, and returns exit codes
- Maven plugin maps plugin parameters to core API options
- tests call core APIs directly where possible
- batch helpers are shared by CLI and Maven plugin when both need them

Do not pack real processing into `main(String[] args)`. The CLI main should delegate to a testable method such as `run(String[] args, PrintStream out, PrintStream err)` and confine `System.exit` to the outermost boundary.

This keeps CLI behavior testable and prevents Maven plugin or future automation from reimplementing product logic.

### Java-Side Extension Principles

Java applications may add operationally useful Java-side extensions.

Examples:

- Maven plugin goals
- batch / directory processing
- public Java core API wrappers
- fat jar packaging
- distribution zip packaging
- classpath-resource access to runtime markdown or prompt specs
- Java-specific logging, timing, or progress integration

These extensions are allowed because they make the Java runtime useful. However, they must be documented separately from upstream-derived behavior.

When adding a Java-side extension, satisfy the following.

- State that it is a Java-side extension
- Keep it outside the upstream mapping unless it has a clear upstream source
- Add focused tests for the extension itself
- Do not let it obscure the upstream single-input or core conversion contract
- Reuse core APIs rather than duplicating conversion logic

Batch and directory processing are especially useful in Java because JVM startup cost and build-tool usage often make grouped execution more practical than launching one process per input.

### Maven and Build Integration Principles

Maven integration is a first-class path when the product naturally participates in build workflows.

This does not mean every Java application version must provide a Maven plugin. A CLI-only or runtime-jar-only repository is acceptable when that is the natural product surface. When a Maven plugin is provided, it should be treated as a first-class adapter over the same core API.

Examples include:

- index generation
- documentation artifact generation
- validation
- conversion
- report generation

When a Maven plugin is provided, the repository may use a multi-module Maven reactor.

The recommended shape is as follows.

- repository root is an aggregator parent project
- runtime jar implementation lives under a runtime module
- Maven plugin implementation lives under a plugin module
- shared core contracts live in the runtime module or a core module
- plugin code depends on core contracts
- core code does not depend on plugin code
- directory / batch helpers used by both CLI and plugin live on the runtime/core side

Maven plugin lifecycle binding should remain opt-in. The plugin should work through explicit invocation first, and consuming projects can bind it to a lifecycle phase when appropriate.

### Packaging and Distribution Principles

Java applications package local runtime use explicitly.

The default runtime artifact is a single executable fat jar.

The normal Maven package should also attach a sources jar, such as `<artifactId>-<version>-sources.jar`. The sources jar is a traceability and publication artifact, not the executable runtime artifact.

When a distribution zip is useful, it should contain the minimal runtime-user-facing items such as:

- runtime jar
- sources jar when publishing or downstream traceability needs it
- `README.md`
- `LICENSE`
- CLI or runtime docs where useful

Artifact names should be predictable and traceable from Maven coordinates.

The basic naming direction is:

- Maven `groupId`: `jp.igapyon`
- Maven `artifactId`: product-derived artifact name
- jar name: `<artifactId>-<version>.jar`
- sources jar name: `<artifactId>-<version>-sources.jar`
- distribution zip name: `<artifactId>-dist-<version>.zip` or a similarly traceable form

Runtime artifacts should not depend on source-tree-relative paths. If runtime markdown, prompt specs, or templates are needed inside the jar, copy them to classpath resources and read them through `getResourceAsStream` or an equivalent jar-safe mechanism.

### CLI Design Principles

The CLI is a formal entrypoint for humans, scripts, build tools, and AI agents.

CLI design emphasizes the following.

- Keep options understandable and close to upstream where applicable
- Use explicit input and output paths
- Use stdout for normal textual output or declared artifact output
- Use stderr for diagnostics, usage errors, progress, and verbose logs
- Make success and failure judgeable by exit code
- Keep verbose output available for progress and timing when useful
- Keep binary output file-based by default
- Test stdout, stderr, exit code, and generated files

When the upstream has a CLI, the Java CLI should respect its interface as far as practical. Differences caused by Java runtime needs should be documented.

CLI help, README usage, and tests should be synchronized closely enough that option descriptions do not drift.

### Diagnostics and Logging Principles

Diagnostics are part of the Java application contract.

Java applications distinguish the following.

- normal output
- generated artifacts
- warnings
- structured result information
- verbose progress
- timing information
- usage errors
- fatal errors

Warnings and changes that do not stop processing should be accumulated in result objects where practical. Entry contract violations and syntactically invalid inputs should move toward exceptions or explicit failure results.

Verbose output should not be mixed into primary output. For example, progress and timing lines can be emitted to stderr by CLI and to Maven logs by Maven plugins, while the core result keeps structured timings and messages for tests or adapters.

### Data and Artifact Principles

Java applications inherit the upstream application's data design.

They should preserve the distinction between:

- canonical input or semantic base
- primary output
- companion output
- diagnostics
- debug trace
- Java-side operational metadata

Java implementation choices should not collapse these roles.

For example, optional Markdown companion output should not become the canonical representation merely because it is easy to emit from Java. A Maven plugin parameter should not become a product semantic if it is only an execution convenience.

When structures affect output order, use deterministic data structures or explicit sorting. `LinkedHashMap` and `LinkedHashSet` are appropriate when insertion order matters.

Text artifacts should use explicit encodings. Binary artifacts should be handled as `byte[]` in core logic where practical, with file paths pushed to CLI, Maven plugin, and test boundaries.

### Reproducibility Principles

Java applications should make outputs reproducible from the same input and settings.

This is especially important for:

- JSON
- Markdown
- XML
- SVG
- XLSX
- ZIP
- distribution archives
- generated indexes

Reproducibility includes more than string equality.

Consider:

- stable output ordering
- stable filenames
- stable archive entry order
- fixed archive timestamps where needed
- explicit encoding
- explicit final newline policy
- avoiding temporary paths in artifacts
- avoiding current dates unless they are part of a declared build artifact

Deterministic artifacts are easier to test, diff, cache, and review by humans and AI agents.

### Testing Principles

Java applications use tests to preserve both upstream parity and Java-side contracts.

Test coverage should include:

- core API tests
- CLI tests
- Maven plugin tests when a plugin exists
- encoding tests where text input/output matters
- artifact tests
- diagnostics tests
- Java-side extension tests

Verification grows in this order when building or strengthening a Java version.

1. semantic parity
2. fixture round-trip
3. API / CLI regression
4. deterministic output
5. byte-level parity

Focused regression commands should be recorded in docs and tied to upstream files, Java classes, and test classes.

`mvn test` remains the primary verification command. Product-specific focused commands are supporting tools, not replacements for the primary command.

### Documentation Principles

Java applications keep README and docs roles separate.

`README.md` is the user-facing entry point. It should explain:

- what the tool does
- how to run the jar
- how to use the Maven plugin if provided
- main inputs and outputs
- major options
- where to find development and migration information

Detailed design, mapping, migration, and maintenance notes should live under `docs/`.

Important Java application docs include:

- development notes
- straight conversion guide
- upstream class mapping
- upstream test mapping
- follow-up log
- remaining migration items
- product-specific specifications

Do not make README carry the whole migration history. Link from README to deeper docs instead.

### `workplace/` Directory Principles

Java repositories use `workplace/` for local upstream checkouts, temporary verification data, smoke inputs, generated outputs, and similar local work.

Rules:

- keep `workplace/.gitkeep` tracked
- do not track normal files under `workplace/`
- do not use `workplace/` as a source directory
- do not hide fixtures that tests require under `workplace/`
- use explicit fixture or testdata directories for checked-in reproducible test data

When an upstream repository needs to be inspected, it may be cloned under `workplace/`. This keeps upstream reference work local without making the Java repository depend on a dirty checkout.

## Recommended Conventions

### Repository Shape

A single-module Java application may be enough when only a runtime jar is needed.

A multi-module Maven reactor is appropriate when the repository provides both runtime jar and Maven plugin.

Representative shape:

```text
repository root
  pom.xml
  README.md
  LICENSE
  docs/
  workplace/.gitkeep
  <runtime-module>/
    pom.xml
    src/main/java/...
    src/test/java/...
  <maven-plugin-module>/
    pom.xml
    src/main/java/...
    src/test/java/...
```

The aggregator root should not contain main Java source unless there is a clear reason.

### Package and Naming Conventions

Use `jp.igapyon.<project>` as the base Java package.

Package and class names should preserve upstream vocabulary where practical.

General direction:

- upstream `kebab-case` file stem becomes Java `UpperCamelCase` class name
- upstream responsibility names become subpackages where helpful
- upstream `camelCase` function names remain Java `camelCase` method names where practical
- large upstream files may be split into Java helper classes if mapping remains clear

Examples:

- `markdown.ts` -> `jp.igapyon.<project>.markdown.Markdown`
- `json-summary.ts` -> `jp.igapyon.<project>.jsonsummary.JsonSummary`
- `path-utils.ts` -> `jp.igapyon.<project>.pathutils.PathUtils`
- `core-api-*.ts` -> `jp.igapyon.<project>.coreapi.*`
- CLI entrypoint -> `jp.igapyon.<project>.cli.<Project>Cli`

Helper suffixes should describe upstream-derived responsibilities:

- `Public`
- `Import`
- `Export`
- `Validate`
- `Parse`
- `Build`
- `Util`
- `Adapters`
- `Registry`
- `Result`
- `Warning`

The criterion is whether the split can be explained in the upstream class mapping document.

### Java Compatibility Conventions

Main source and binary compatibility are fixed to Java 1.8.

Avoid APIs and syntax that require newer Java versions, such as:

- `List.of`
- `Map.of`
- `record`
- `var`
- `Files.readString`
- text blocks

The compiler may run on a newer JDK, but the produced source and bytecode compatibility should remain aligned with the repository's Java 1.8 policy.

### Public API Conventions

Core APIs should expose stable entrypoints useful to CLI, Maven plugin, tests, and automation.

Prefer:

- options objects for operation settings
- result objects for multi-artifact output, warnings, changes, and timings
- direct return of `String`, `byte[]`, or model objects for simple operations
- explicit defaults at public entrypoints

During initial straight conversion, simple POJOs with public fields are acceptable when they preserve readability and mapping. More Java-style encapsulation can be considered later, but should not break traceability or public contracts without reason.

### CLI Conventions

CLI implementation should provide a testable entrypoint.

Representative shape:

```text
public static void main(String[] args)
  -> int run(String[] args, PrintStream out, PrintStream err)
     -> core API
```

CLI tests should check:

- parsed options
- usage text
- stdout
- stderr
- exit code
- output files
- no-overwrite or failure behavior where relevant

For normal usage, output files are preferred for generated artifacts. Stdout should be used only when the command contract clearly states it.

### Maven Plugin Conventions

Maven plugins should be thin adapters over the core API.

Plugin parameters should map clearly to core options. Plugin code should not duplicate directory traversal, conversion, validation, or artifact assembly if those operations belong to the runtime module.

Plugin tests should check:

- parameter mapping
- skip behavior
- generated output
- logging behavior where relevant
- failure behavior

### Mapping Document Conventions

At minimum, keep an upstream class mapping document with this shape.

```text
upstream file:
  <upstream-root>/src/<target>.ts

java classes:
  jp.igapyon.<project>.<package>.<ClassA>
  jp.igapyon.<project>.<package>.<ClassB>

notes:
  - facade:
  - helper split:
  - Java-side extension:
```

`<upstream-root>` may be a vendored upstream snapshot, a local checkout under `workplace/`, or another repository-specific upstream reference location. The mapping should make the chosen reference method explicit without requiring this shared memo to fix the physical path.

At minimum, keep an upstream test mapping document with this shape.

```text
upstream test / intent:
  <upstream test name or behavior>

java tests:
  <JavaTestClass.testMethod>

fixtures:
  <fixture path>

focused regression:
  mvn test -Dtest=<JavaTestClass>
```

These mappings are used both during initial conversion and during maintenance.

## Common Patterns Observed Across Java Versions

### CLI and Maven as Peer Entrypoints

For Java application versions, CLI and Maven plugin can both be first-class paths.

The CLI is natural for direct local execution, scripts, CI, and AI agents.

The Maven plugin is natural when generated artifacts belong to a Java project's build, documentation, validation, or reporting flow.

Both should call the same core API.

### Core API as the Center

Java applications tend to place a clear core API at the center.

A typical shape is a product-named facade or core class that receives an options object, executes the main operation, and returns structured results or generated artifacts.

That shape lets:

- CLI convert arguments into options
- Maven plugin convert parameters into options
- tests call the same operation directly
- batch behavior be shared instead of duplicated

This is the Java counterpart of the main-application principle that UI, CLI, tests, and Agent Skills should call the same core where possible.

### Upstream Traceability Over Java Redesign

Java applications do not initially optimize for the most idiomatic Java architecture.

They first optimize for:

- easy upstream comparison
- stable mapping
- clear responsibility correspondence
- test intent preservation
- explainable diffs

Later Java-side cleanup is allowed, but should be done only after the upstream-following path is secure.

### Local Batch Workflows

Java applications often benefit from batch and directory workflows.

This is practical because:

- Java process startup has cost
- Maven plugins usually work over project directories
- generated artifacts often need to be produced for many inputs
- build and CI workflows prefer one invocation per task group

Batch workflows should be documented as Java-side extensions unless they already exist in the upstream contract.

### Reproducible Outputs for Automation

Java applications are often used in environments where generated artifacts are checked, compared, cached, or committed.

Therefore deterministic output is more than a testing convenience. It is part of the user value.

Stable byte output lets users and AI agents answer:

- Did the generated artifact actually change?
- Which input caused the change?
- Can this output be reviewed in a normal diff?
- Can the command be rerun in CI?

## Product-Specific Notes

### Notes Specific to `miku-indexgen-java`

`miku-indexgen-java` is a Java implementation of `miku-indexgen`.

It scans a directory and generates `index.json`. When Markdown output is enabled, it also generates `index.md`.

The Java version currently has two main execution paths.

- runtime jar / CLI
- Maven plugin

The central core API is:

- `jp.igapyon.mikuindexgen.coreapi.Indexgen.createIndexes(IndexgenOptions)`

CLI and Maven plugin layers map their inputs into `IndexgenOptions` and call the same core API.

Important design points:

- `index.json` is the primary structured output
- `index.md` is optional companion output
- directory scanning behavior is shared by CLI and Maven plugin through runtime-side code
- verbose progress and timing information are kept separate from primary output
- Maven plugin goals are Java-side extensions
- child-directory batch mode is a Java-side extension and should not be confused with the upstream single-input contract
- upstream class and test mappings are recorded under `docs/`

#### Child-Directory Batch Mode in `miku-indexgen-java`

`miku-indexgen-java` has a Java-side child-directory batch mode.

This mode is specific to `miku-indexgen-java` and should not be read as a cross-cutting requirement for all miku Java applications. The cross-cutting principle is only that Java versions may add batch / directory processing when it is useful and documented as a Java-side extension.

The current contract is as follows.

- CLI option `--input-parent-directory <dir>` selects a parent directory
- Maven plugin goal `index-child-directories` selects a parent directory through `inputParentDirectory`
- the parent directory itself is not indexed as one input base
- each direct child directory under the parent is processed independently
- direct child files under the parent are ignored
- hidden child directories are skipped
- recursive scanning still means recursion inside each selected child directory
- when `--output-directory` or plugin `outputDirectory` is omitted, outputs are written under each child directory
- when an output directory is specified, outputs are written under child-specific paths such as `<outputDirectory>/<child>/index.json`
- the same core API, `Indexgen.createIndexes(IndexgenOptions)`, handles both single-directory mode and child-directory batch mode

This feature exists because `miku-indexgen-java` is often useful for generating many small directory indexes in one Java process or Maven execution. It is therefore an operational extension on the Java side, not a change to the upstream `miku-indexgen` single-directory contract.

The repository is a multi-module Maven reactor.

- root aggregator project
- `miku-indexgen/` runtime jar and CLI implementation
- `miku-indexgen-maven-plugin/` Maven plugin implementation

This shape is appropriate because the runtime jar and Maven plugin are separate deliverables but use the same core API.

### Notes Specific to `mikuproject-java`

`mikuproject-java` is positioned as a Java version of `mikuproject`.

The upstream product treats `MS Project XML` as the semantic base and uses `ProjectModel` as the internal neutral representation for validation, workbook exchange, AI-facing views, patch application, and report generation.

#### Runtime Entrypoints in `mikuproject-java`

The Java version currently emphasizes the following execution paths.

- runtime jar / CLI
- Java-side multi-input batch commands
- public core API facades
- deterministic report and exchange artifact generation
- distribution zip for runtime users

Unlike `miku-indexgen-java` and `miku-xlsx2md-java`, the current `mikuproject-java` repository is a single-module Maven project. It does not currently expose a Maven plugin module. This is acceptable because the current Java-side product surface is centered on CLI, core API, report generation, and distribution packaging rather than build-lifecycle integration.

#### Core Facades in `mikuproject-java`

The Java-side public surface is organized around `jp.igapyon.mikuproject.coreapi` facades.

Representative facade groups include:

- `CoreApiPublic` / `CoreApi`
- `CoreApiMsproject`
- `CoreApiWorkbook`
- `CoreApiImport`
- `CoreApiReport`
- `CoreApiMsprojectAi`
- `CoreApiAiJson`

These facades are Java-side aggregation points. They should remain traceable to upstream responsibilities such as MS Project XML import/export, workbook JSON / XLSX exchange, patch JSON, AI-facing views, report generation, and external import. They should not become a reason to hide upstream file boundaries or replace upstream vocabulary with unrelated Java-only abstractions.

#### Product Boundary in `mikuproject-java`

Important design points:

- preserve the upstream goal of bridging `MS Project XML`, WBS reports, workbook exchange, and AI workflows
- keep `MS Project XML` and `ProjectModel` as the semantic center
- treat workbook JSON, `.xlsx`, AI JSON, patch JSON, Markdown, SVG, Mermaid, and WBS XLSX as exchange, editing, report, or inspection surfaces around that center
- keep browser Web UI behavior out of scope
- keep AI-facing workflows artifact-based, such as project overview, phase detail, task edit, draft request, patch JSON, validate, apply, and diff-oriented outputs
- keep report outputs such as WBS Markdown, daily / weekly / monthly SVG, Mermaid, WBS XLSX, report directory, and report bundle as derived artifacts, not canonical project state
- make report bundle and report directory outputs deterministic enough for byte-level comparison where practical
- keep CLI help, README command lists, mapping documents, and focused tests synchronized

#### Batch Commands in `mikuproject-java`

`mikuproject-java` has many Java-side `*-batch` CLI commands.

These commands are operational extensions for local automation. They are useful because project report and import/export workflows often need to process several XML, workbook, JSON, or patch files in one JVM invocation.

This batch surface should be read as a Java-side extension, not as a change to the upstream `mikuproject` single-operation product contract.

The current direction is:

- keep single-input commands as the clearest counterpart to upstream behavior
- use `*-batch` names for Java-side multi-input commands
- keep output root / input / name pair handling explicit
- reject invalid argument combinations at the CLI boundary
- test usage errors, command failures, stdout / stderr, and generated files
- avoid adding more batch commands merely for symmetry when the current operational value is not clear

#### Repository Shape in `mikuproject-java`

The repository currently uses a single Maven project.

The expected runtime artifacts are:

- `target/mikuproject.jar`
- `target/mikuproject-sources.jar`
- `target/mikuproject-dist.zip`

The distribution zip contains the runtime jar, sources jar, and minimal runtime-facing documentation such as `README.md`, `LICENSE`, and CLI documentation.

This single-module shape should remain acceptable while there is no Maven plugin deliverable. If a Maven plugin is added later, the repository should be reconsidered as a multi-module Maven reactor so that plugin code remains a thin adapter over the runtime / core API rather than a second implementation.

#### Maintenance Focus in `mikuproject-java`

Because `mikuproject-java` has a broad product surface, maintenance should be organized by upstream file and by major responsibility group.

Practical groups are:

- `MS Project XML` / `ProjectModel` / validation
- workbook JSON and project XLSX
- patch JSON and AI JSON import
- AI-facing project views
- report outputs such as WBS Markdown, SVG, Mermaid, WBS XLSX, report directory, and report bundle
- CLI and Java-side batch extensions

For upstream-following work, first use the upstream class mapping and upstream test mapping documents to find the affected Java classes and tests. CLI batch behavior, distribution packaging, and report directory / bundle conveniences should be recorded as Java-side extensions when they do not have direct upstream counterparts.

### Notes Specific to `miku-xlsx2md-java`

`miku-xlsx2md-java` is positioned as a Java version of `miku-xlsx2md`.

The upstream product treats the Excel workbook as canonical input and Markdown as the primary extracted representation for design-document structure.

#### Runtime Entrypoints in `miku-xlsx2md-java`

The Java version currently exposes the following main execution paths.

- runtime jar / CLI
- Maven plugin
- Java-side directory batch conversion shared by CLI and Maven plugin
- selected Node / Java Markdown byte-level comparison script for upstream fixtures

#### Core Facade in `miku-xlsx2md-java`

The central runtime facade is:

- `jp.igapyon.mikuxlsx2md.core.Core`

The main core operations are:

- `Core.parseWorkbook(byte[], String)`
- `Core.convertWorkbookToMarkdownFiles(ParsedWorkbook, MarkdownOptions)`
- `Core.convertSheetToMarkdown(ParsedWorkbook, ParsedSheet, MarkdownOptions)`
- `Core.toExportWorkbook(ParsedWorkbook)`

CLI and Maven plugin layers should remain thin adapters over this runtime side. Directory conversion is implemented as a Java-side operational extension through `jp.igapyon.mikuxlsx2md.directoryconverter.DirectoryConverter`, so that CLI and Maven plugin directory workflows do not duplicate workbook conversion logic.

#### Product Boundary in `miku-xlsx2md-java`

Important design points:

- preserve the upstream goal of workbook-to-Markdown extraction
- do not turn the Java version into a full Excel renderer
- treat Excel `.xlsx` workbooks as canonical input
- treat Markdown as the primary extracted representation
- keep Markdown, ZIP assets, summaries, formula diagnostics, and Java-side operational metadata separated by role
- prefer local CLI / batch / build integration over Web UI behavior
- keep workbook parsing and output generation traceable to upstream responsibilities
- avoid adopting broad dependencies in a way that hides conversion meaning
- make ZIP / asset / Markdown output reproducible where practical
- keep CLI help, README usage, Maven plugin parameters, and tests synchronized

#### Repository Shape in `miku-xlsx2md-java`

The repository is a multi-module Maven reactor.

- root aggregator project
- `miku-xlsx2md/` runtime jar and CLI implementation
- `miku-xlsx2md-maven-plugin/` Maven plugin implementation

This shape is appropriate because the runtime jar and Maven plugin are separate deliverables but use the same runtime conversion implementation.

#### Directory Batch Conversion in `miku-xlsx2md-java`

`miku-xlsx2md-java` has Java-side directory batch conversion.

This mode is specific to Java runtime and build-tool operation. It should not be read as a change to the upstream workbook-to-Markdown single-input product contract.

The current contract is as follows.

- CLI option `--input-directory <dir>` selects directory conversion
- Maven plugin goal `convert-directory` selects directory conversion through `miku-xlsx2md.inputDirectory`
- `--recursive` and `miku-xlsx2md.recursive` control recursive scanning
- only files whose names end with `.xlsx` are processed
- when output directory is omitted, Markdown files are written next to the input workbooks
- when output directory is specified, relative input paths are mirrored under the output directory
- ZIP output is not part of directory conversion
- verbose mode reports processing workbook paths to stderr in CLI and Maven logs in the plugin

This feature exists because workbook conversion often needs to run over many local files in one Java process or Maven execution. It is therefore an operational extension on the Java side, not a replacement for the upstream single-workbook conversion contract.

## Maintenance Policy

After initial conversion, Java applications are maintained by comparing against upstream deliberately.

The maintenance workflow should include:

- check upstream changes by upstream file
- update mapping documents when responsibility changes
- update test mapping when upstream test intent changes
- record known diffs and follow-up items
- run focused regression commands for affected areas
- run `mvn test` before release-level confidence
- keep README, CLI help, and plugin docs synchronized when those surfaces exist

When an upstream bug is found, record it separately from Java-side implementation work. Do not silently redesign the Java side so far that the difference can no longer be explained.

When a Java-side extension is added, test and document it as Java-specific behavior.

## Summary

miku Java application versions are not independent rewrites of the upstream tools.

They are local Java runtimes that preserve upstream product meaning while making CLI, Maven, batch, testing, packaging, and reproducible artifact generation stronger.

The central design question is:

> Can this Java behavior be traced back to upstream meaning, or clearly explained as a Java-side extension?

When the answer remains clear, Java versions can be useful as practical local tools while staying maintainable against their Node.js / TypeScript upstreams.
