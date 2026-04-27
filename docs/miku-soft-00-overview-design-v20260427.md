# Miku Software Overview Design v20260427

This memo is the entry point for the shared design documents of the `miku` software series.

The initial versions of the related tools were created by `Mikuku` and Toshiki Iga.

The current contents are based on the main-application design memo, Java application design memo, straight-conversion guide, Agent Skills design memo, and MCP design memo checked on 2026-04-27.

## Design Summary

The `miku` software series can be summarized as follows.

> A family of small, local-first bridge tools that expose domain files and domain data through human-facing Web Apps, scriptable CLI runtimes, agent-facing skill packages, Java runtime artifacts, and MCP protocol adapters while preserving each product's semantic center.

The series is not organized around a single UI, runtime, or protocol. It is organized around a layered product shape.

- Keep each upstream product's semantic center clear
- Provide human-facing Single-file Web Apps where useful
- Provide Node.js CLI surfaces as normal main-application surfaces
- Provide Java 1.8 CLI runtimes through straight conversion as a normal follow-up deliverable
- Package Agent Skills with instructions, operation maps, references, and executable CLI runtime artifacts
- Provide MCP servers in Node.js / TypeScript when there is no product-specific reason to avoid them
- Keep Java versions, Agent Skills, and MCP servers downstream of the upstream product semantics
- Preserve artifact roles, diagnostics, local execution, and runtime traceability across layers

## Role of This Document

This document is not a replacement for the detailed design documents. It explains how those documents fit together and records the product-family shape that sits above them.

The detailed documents define the behavior and conventions of each layer. This overview explains the order, responsibility split, and intended relationship among those layers.

When a specification is unclear, read this overview as the product-family map, then use the layer-specific document for detailed decisions.

## Document Set

This overview is the entry point for the shared miku software design document set.

The detailed documents are organized by layer and concern.

- `docs/miku-soft-00-overview-design-v*.md`
  - provides the top-level product-family overview and explains how the design documents relate to each other
- `docs/miku-soft-10-mainapp-design-v*.md`
  - describes the main application layer, including the Single-file Web App and Node.js CLI as normal first-class product surfaces
- `docs/miku-soft-20-javaapp-design-v*.md`
  - describes Java application versions, especially Java 1.8 CLI/runtime artifacts, packaging, testing, and build integration
- `docs/miku-soft-30-straight-conversion-v*.md`
  - describes how TypeScript / Node.js products are converted into Java while preserving upstream traceability and behavior
- `docs/miku-soft-40-agentskills-design-v*.md`
  - describes Agent Skills packages, including local instructions, operation maps, references, and bundled CLI runtime artifacts for AI agents
- `docs/miku-soft-50-mcp-design-v*.md`
  - describes Node.js / TypeScript MCP server versions that expose product operations to MCP clients through tools, resources, and prompts

## Layered Product Shape

The miku software series can be understood through three facing layers.

1. Human-facing layer
2. Agent-facing layer
3. MCP-facing layer

These are facing layers, not independent product semantics. The upstream product owns the semantic center. Downstream runtime, skill, and protocol layers should expose that product meaning without becoming replacement implementations.

## Human-Facing Layer

A miku main application normally has two first-class surfaces: a Single-file Web App for human users and a Node.js CLI for automation, agents, and repeatable local workflows.

The Single-file Web App is the human-facing surface when a product benefits from interactive loading, preview, diagnostics, and download. It is usually created in Node.js / TypeScript, has a Web UI, and runs locally in a browser without requiring server setup.

The Node.js CLI is also a normal main-application surface. It exposes the same product core for scripts, repeatable local workflows, downstream Agent Skills, and later runtime adapters.

Some main applications may be CLI-only when that is the natural product shape. In that case, the product is still a main application if it stands as the primary upstream product, accepts real local input, and produces verifiable artifacts.

The human-facing layer should keep the following properties.

- local-first execution
- no server requirement for core functionality
- clear canonical source or semantic base
- structured outputs that scripts and AI agents can reuse
- human-reviewable outputs such as HTML, Markdown, SVG, XLSX, XML, or ZIP when useful
- shared core behavior behind UI, CLI, tests, and downstream adapters where practical

## Java Runtime Layer

A Java 1.8 CLI runtime is treated as a normal follow-up deliverable for miku products, implemented through straight conversion from the TypeScript / Node.js product unless there is a clear reason not to.

The Java runtime should not be a Java-first redesign. Its first responsibility is to preserve upstream semantics, vocabulary, file-boundary traceability, CLI behavior, diagnostics, and artifact roles while making the product easier to run in Java-centered local and build environments.

The Java runtime layer usually emphasizes:

- Java 1.8 source and binary compatibility
- CLI runtime jar
- batch execution where it has clear operational value
- Maven and build-tool integration when useful
- deterministic artifact generation
- public core APIs callable from CLI, tests, Maven plugins, and automation
- distribution artifacts such as executable jars, sources jars, and distribution zips

The TypeScript / Node.js CLI and Java CLI are peer runtime surfaces when both exist. Differences caused by runtime constraints should be documented rather than hidden.

## Straight Conversion Layer

Straight conversion is the bridge from the TypeScript / Node.js upstream product to the Java runtime.

It is not a separate user-facing product layer. It is the reproducible method used to create and maintain Java versions without losing the ability to follow upstream changes.

Straight conversion fixes the following direction.

- Do not start from Java-first redesign
- Keep upstream file boundaries and vocabulary traceable
- Keep upstream tests and Java tests mapped
- Keep the Node.js CLI contract close where a CLI exists
- Treat Java-side extensions as separate contracts
- Keep the Web UI out of the Java runtime unless explicitly required

The output of straight conversion is a Java application version that remains understandable as a downstream runtime of the upstream product.

## Agent-Facing Layer

The agent-facing layer packages the product for AI agents.

Agent Skills are not only instruction documents. They are agent-facing packages that combine local instructions, constraints, operation maps, references, and executable CLI runtime artifacts.

The normal first runtime is the TypeScript / Node.js CLI artifact produced by the main application. A Java CLI runtime is also a normal runtime path when the Java version exists. As the target shape, miku Agent Skills should receive runtime artifacts as simple files under the skill package.

Typical runtime artifacts are:

- a single JavaScript CLI file for the Node.js runtime path
- a single jar for the Java CLI runtime path

Both runtime paths belong to the same skill product. Their presence should not split the skill name, activation rules, workflow vocabulary, artifact roles, or product boundary.

Agent Skills should use upstream public APIs, documented CLI commands, stable global APIs, or bundled runtime artifacts before writing skill-local product logic. If the upstream product does not expose a needed capability, the preferred direction is to add or stabilize that capability upstream, then let the skill call it.

The agent-facing layer should especially preserve:

- explicit activation boundaries
- product-specific operation maps
- distinction between canonical source, state, draft, patch, projection, report, and diagnostics artifacts
- local file workflow discipline
- hard-error and soft-warning reporting
- runtime lookup through declared skill-local artifacts before broad repository search

## MCP-Facing Layer

The MCP-facing layer is a normal extension target, not a replacement for Agent Skills.

When there is no product-specific reason to avoid it, a miku product should provide an MCP server for MCP clients. The standard implementation choice for miku MCP servers is Node.js / TypeScript, using the MCP SDK and keeping the server as a thin protocol adapter.

The MCP server exposes product operations through tools, resources, and prompts. It should remain a protocol adapter over the product runtime, not a replacement implementation.

The MCP server may execute the TypeScript / Node.js runtime, the Java runtime, or both as product runtime artifacts. This runtime choice is separate from the MCP server implementation language. When both runtime artifacts are available, the MCP server should treat runtime choice as an execution policy, not as a change in product semantics.

Java should not be treated as a default second MCP server implementation. A Java-side directory in an MCP repository may exist as a placeholder, but it should remain a placeholder unless a concrete future distribution or runtime constraint justifies maintaining a Java MCP server.

The MCP-facing layer should keep the following properties.

- product-prefixed tools with structured input schemas
- structured tool results and diagnostics
- resources for reusable state, specifications, reports, generated files, and diagnostics
- small product-specific prompts when useful
- local stdio transport as the first implementation target
- HTTP transport as an additional deployment form with explicit session, storage, authentication, and isolation boundaries
- shared tool names and result shapes across local and server variants

MCP servers and Agent Skills should stay aligned around upstream product vocabulary, operation maps, artifact roles, and runtime contracts. Neither layer should become the semantic owner of the product.

## Normal Product Flow

The usual product flow for the miku software series is as follows.

1. Create or maintain the TypeScript / Node.js main application.
2. Provide the Single-file Web App when human-facing UI is useful.
3. Provide the Node.js CLI as a normal product surface.
4. Produce a single-file Node.js CLI runtime artifact for downstream use.
5. Create the Java 1.8 CLI runtime through straight conversion unless there is a clear reason not to.
6. Package Agent Skills with instructions, operation maps, references, and bundled runtime artifacts.
7. Provide a Node.js / TypeScript MCP server when there is no product-specific reason to avoid it.

This flow is a default direction, not a reason to blur responsibilities. Each layer must keep the upstream product boundary visible.

## Responsibility Split

The preferred responsibility split is as follows.

- Main application
  - owns product semantics, canonical source or semantic base, primary conversions, core APIs, Web UI when present, and Node.js CLI
- Java application
  - owns Java runtime packaging, Java CLI, Java-side batch or build integration, and Java-side tests while preserving upstream behavior
- Straight conversion guide
  - owns the method for creating and maintaining Java versions from TypeScript / Node.js upstreams
- Agent Skills package
  - owns agent-facing instructions, activation rules, workflow maps, local file discipline, runtime lookup, and bundled runtime artifact wiring
- MCP server
  - owns MCP tools, resources, prompts, transport handling, session or workspace policy, and protocol result formatting
  - is normally implemented in Node.js / TypeScript; Java runtime artifacts remain runtime inputs, not a default second MCP server

The semantic center should remain with the upstream main application. Runtime, skill, and protocol layers should expose or adapt that center rather than redefining it.

## Shared Artifact Discipline

Across all layers, miku products distinguish artifact roles.

Common roles include:

- canonical source or semantic base
- internal product state
- AI-facing projection
- draft or patch returned by AI
- primary exchange output
- human-facing report
- generated bundle
- diagnostics and warnings
- temporary scratch output

These roles should not be collapsed only because the artifacts share a file extension or can all be represented as JSON or files.

For example, a structural workbook `XLSX`, a human-facing `WBS XLSX`, a workbook JSON state file, and a Patch JSON document may all participate in one product workflow, but they are not the same contract.

Keeping artifact roles visible makes UI, CLI, Java runtime, Agent Skills, and MCP server behavior easier to align.

## Summary

The miku software series starts from small local products, usually implemented in TypeScript / Node.js, and then exposes the same product meaning through multiple surfaces.

The main application provides the upstream semantic center and normally exposes both a Single-file Web App and a Node.js CLI. Java versions provide Java 1.8 CLI runtimes through straight conversion. Agent Skills package instructions and executable runtime artifacts for AI agents. MCP servers expose product operations through a standard protocol for MCP clients and are normally implemented in Node.js / TypeScript.

The important point is not to multiply implementations. It is to keep one product meaning usable from human UI, local CLI, Java runtime, agent package, and MCP protocol without losing traceability, diagnostics, or artifact discipline. In particular, a Java runtime artifact does not imply that a Java MCP server should also be implemented.
