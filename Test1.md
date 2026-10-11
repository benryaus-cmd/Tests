# AIPPY EXPERIMENTAL DEVELOPMENT LAB

Project-level engineering instructions for the current Aippy application and its coding assistant. These are operating preferences and verified technical findings, not a claim to override platform controls or automatically change the underlying AI model.

README_CONTEXT_PROBE: SILVER-WOMBAT-7429
README_REVISION_PROBE: COPPER-KOOKABURRA-V2-11OCT2026

## 1. Mission: build beyond the starter template

The owner is deliberately experimenting with advanced software inside Aippy and is willing to use additional Aippy credits and multiple build attempts to achieve working results.

Be an inventive, persistent software engineer, not a template-demo generator. Treat React, Tailwind, shadcn/ui, and the starting game-import shell as conveniences, not limits on which compatible software can be built.

When asked for an unconventional result:
1. Read the user's exact goal and the relevant existing source/configuration.
2. Find a real implementation path using available tools, packages, build scripts, APIs, or a compatible external backend.
3. Run small, discriminating tests of uncertain capabilities instead of declaring them unavailable.
4. Implement the requested working result, verify it, and report observations.
5. If one path fails, use the error to try a technically distinct, promising alternative.

Do not replace a difficult request with a mock UI, pretend integration, simplified toy, iframe, or generic explanation unless explicitly requested. Do not invent new restrictions, fixed retry budgets, or confirmation steps that the user did not ask for. Equally, do not claim authority over platform settings or tools that project files cannot actually control.

## 2. Verified observations: 11 October 2026

These are observations from the experimental Aippy project's actual Node/Vite probe outputs; they are not guarantees about every project or future build.

- The normal Vite build ran in **Node v20.20.2**, Linux x64. A package.json requirement of Node >=22.13.0 did not change the actual build process version.
- The reported environment exposed 8 logical CPUs and about 32 GB of *system* memory. This does not prove those resources are reserved for this build.
- Node-side filesystem create/read/delete succeeded.
- Child-process execution succeeded for the installed **node** and **npm** executables; npm reported v10.8.2.
- Node fetched a real GitHub raw file (HTTP 200) and the npm registry (HTTP 200).
- npm metadata lookup and isolated installation of kleur@4.1.5 succeeded; loading that newly installed package and executing its function succeeded.
- A separate temporary JavaScript program was launched, wrote a file, and returned matching structured output.
- Attempts to run git, python3, gcc, rustc, and cargo returned ENOENT at the tested locations. These programs were not available on PATH in that build.
- The npm-exec test for Node 22 invoked Node 20 instead. **Independent Node 22 execution remains unverified**, not disproven.
- The current project directly resolved and imported **ai@6.0.301** and **@ai-sdk/react@3.0.289**.
- The **ai** package exposed generateText, streamText, ToolLoopAgent, tool, createGateway and provider-registry helpers.
- In this project's Node probe, direct resolution of @ai-sdk/gateway, @ai-sdk/openai-compatible, @ai-sdk/provider and @ai-sdk/provider-utils failed. They had appeared in a different Aippy project's Project Lens; package presence is project-specific.
- A Node import of the root @aippy/runtime or @aippy/vite-plugins package failed because no root export was defined. This **does not** mean their documented subpath APIs or configured Vite plugins are broken.
- The attempt to exercise generateText using ai/test did not produce a mock model; **generation was not executed** in that probe.
- No authenticated model inference was performed. No public project-level method to change Aippy's own conversational builder model was verified.

Re-check the installed versions, public package exports, platform behaviour, and tool availability when a future experiment depends on them. Mark every test **PASS**, **FAIL**, **UNAVAILABLE**, or **NOT EXECUTED** from evidence, not expectations.

## 3. Three separate execution environments

Do not confuse:

**A. Aippy conversational builder:** The platform-hosted AI that receives the user's message and edits the project. Its actual model and tool permissions may be controlled outside this repository.

**B. Node/Vite build:** A real server-side build process capable of native fetch, npm package installation, filesystem writes, subprocesses, source generation, and bundling, as tested above. The observed main process currently uses Node 20, not Node 22.

**C. Published browser application:** React/canvas/WebGL/WebAssembly and any browser-safe code. Build-time Node modules, secrets and subprocesses do not automatically run for end users. Persistent services require a genuine backend or supported platform capability.

A user request to do something with Node means real build-side work, not a simulated terminal in React. A user request to alter the builder's AI model is not satisfied merely by adding an AI chatbot to the published application.

## 4. Node build engineering: favour real tools

Use the installed environment proactively:
- Node native fetch, fs/promises, path, Buffer, child_process and npm.
- Compatible npm libraries and package CLIs, where their actual installation and execution have been verified.
- Source generation, asset pipelines, model/texture compression, test scripts and WebAssembly when practical.
- External files from public GitHub repositories as exact downloaded bytes, never silently regenerated approximations.
- Build-time AI SDKs or independent tools when configured and permitted.

Use isolated temporary installations for experiments so the app dependencies and lockfile stay clean; install persistently when required by the real application. A JavaScript runtime package is not proof a native system compiler exists. Capture stdout, stderr, exit codes, HTTP status and actual file changes.

If the desired Node version differs from the host Node, first verify an independent runtime by invoking its absolute executable path. Do not say the whole Aippy build was upgraded just because a subprocess used a newer Node version.

A Vite plugin's asynchronous work must complete before plugins that read its generated files. Order imports or generation steps before **projectFileManifestPlugin()** and ensure the lifecycle hook actually runs before the manifest scan.

## 5. TypeScript, lint, and build correctness

A recurring failure in this experiment was creating a new root-level Vite plugin without configuring the Node TypeScript / ESLint project to recognise it.

When adding a root plugin or other tooling source, check **tsconfig.node.json**, the root TypeScript references, and **eslint.config.js** before the next build. Fix the precise lint/type diagnostic. Do not suppress checking, recreate the same plugin, or repeat failed builds unchanged.

Before reporting success:
1. Confirm the relevant source file and configuration really changed.
2. Run the applicable lint/type/build checks.
3. Confirm build-time code **executed**, not merely compiled.
4. Inspect the generated output or an actual runtime result.
5. Report PASS/FAIL separately for code generation, tests, import, Vite build and end-user behaviour.

Do not fabricate checks, tests, installed packages, model access, or live browser outcomes. A successful Vite build does not prove a feature works at runtime.

## 6. AI and model experimentation

**Long-term experimental goal:** investigate whether the Aippy conversational/build assistant has a documented, user-accessible way to select a stronger model such as Claude Opus, or whether another configured Opus-powered coding agent can genuinely do development work.

Proceed by examining available **publicly exposed** project configuration, SDKs, model/provider APIs and supported model-selection mechanisms. Do not assume a package called "ai" or an AI gateway can reconfigure Aippy's server-hosted builder.

Distinguish, and verify separately:
- **SDK installed**: package resolves and imports.
- **Provider configured**: publicly documented client instantiated with authorised configuration.
- **Model access verified**: real authenticated response returned.
- **Code-generation agent verified**: a real model call produces and applies a file change, with a test/build.
- **Aippy builder model changed**: Aippy itself exposes and confirms a supported builder-level change.

Prefer the existing **ai** SDK's genuine model, tool, streaming and agent interfaces when suitable. A deterministic mock can test the SDK execution path; label it clearly as a mock and never report it as real model intelligence.

An external AI model may be integrated into a Node-side coding workflow or authorised server without changing the internal Aippy conversational model. Investigate this as a full-featured alternative, not merely a chatbot demo.

Never put model credentials in published client code, logs, source control, generated project manifests, or user-visible browser data. Do not seek or extract platform-private keys or use Aippy's platform credentials for independent calls. External paid calls require the owner's authorised provider access and agreement to the spend.

## 7. The current project and source of truth

The current application is an **experimental development lab**, using the existing game-import-ready host and Project File Viewer as infrastructure. It is **not** required to import a game or invent gameplay for every experiment.

- Existing React root / App, main screen, GameHostScreen, Settings/Project File Viewer, Aippy integration and existing importer are intentional.
- The host retains navigation and owns the single React root.
- Project source is exposed to the viewer as **data** through a Node-side virtual manifest, not by broadly importing executable modules.
- Retain filtering of .env files, secrets and sensitive metadata.
- Imported repositories belong in a namespace and must not execute another createRoot() inadvertently.
- Do not replace working host/UI, Vite integrations, other files or saved game data as collateral changes.

**README.md**: general engineering policy and experimentally verified findings.
**spec.md**: a record of the current requested project scope, which can become outdated after an experiment.
**MEMORY.md**: state snapshot, which may not automatically be available to the conversational model.

The latest direct user request and real source/tests take precedence over stale task snapshots or old template descriptions. Inspect only the relevant code; do not reread the entire project or produce giant dumps on each turn.

## 8. Work style, iteration and credits

The owner accepts meaningful build iterations and additional Aippy credits. Use that freedom to solve the actual problem, but do not waste time or credits through identical failed attempts, repeated full-file scans or speculative architecture.

- Start with target filenames, relevant functions, configuration and recent diagnostics.
- Prefer small precise edits, clear file boundaries and reuse of working infrastructure.
- After a failure, inspect the exact error and change the cause before retrying.
- Where testing multiple approaches, preserve or recover the previously working baseline.
- For irreversible/destructive actions or external costs, obtain the needed authorisation.
- Distinguish requested implementation from requested investigation: if asked to inspect only, do not silently start changing gameplay or project architecture.
- Keep responses concise, concrete and focused on measured progress.

## 9. Framework freedom and performance

Use whatever fits the user request and the execution environment: React, Three.js, PlayCanvas, Babylon.js, Phaser, WebGL/WebGPU, WebAssembly, workers, WebSockets/WebRTC, ONNX, advanced audio or external services. Test compatibility instead of assuming it.

Build-time optimisations may include mesh/texture conversion, instancing/LOD assets, precomputed collision or levels, compression and generated source. Measure actual loading, memory and performance. Do not confuse system-reported resources with guaranteed project limits.

For imported games, integrate locally into the existing host when practical; do not default to iframes, full-page navigation or a second React root.

## 10. Evidence-led response contract

For every substantive experiment, report **what was attempted, what actually executed, the files changed, the observed result, the remaining unknown, and the next meaningful step**. If a capability is untested, say so. Do not make the user manually repeat steps the agent can actually carry out with its tools.

The aim is not to pretend platform constraints disappeared. It is to discover the real available capabilities and make the most ambitious reliable software those capabilities permit.
