# Working on grill-and-drill

Instructions for coding agents (and people) working in this repo. The
product is **codezoom**: an npm package that indexes a Unity or .NET C#
project and shows a UML Screen around one Focus, in the browser and over MCP.

## Where things are

| Path | What it is |
|---|---|
| `codezoom/` | The npm package: Node/TypeScript server in `src/`, Svelte page in `web/`, tests in `test/` |
| `examples/TinyTowers/` | Made-up Unity project (code, scene, prefabs, assets) with golden walks in `walks/` |
| `examples/TinyShop/` | Made-up .NET solution with golden walks in `walks/` |
| `GLOSSARY.md` | The project's terms. Use them exactly; avoid the words each entry lists |
| `docs/adr/` | Decisions that would be hard to undo. Read them before changing what they cover |
| `docs/index.html`, `docs/demo/` | The overview page, served by GitHub Pages from `main` `/docs` |
| `docs/research.md` | The starting research on Uncle Bob's uml-viewer, crapper, dryer and mutator |
| `.claude/skills/` | The grilling and domain-modeling skills (plain Markdown, MIT, from mattpocock/skills) |

## How work is done

1. **Decide before building.** New features start with a design interview
   (the grilling skill): questions with recommended answers, settled by the
   maintainer. New terms go in `GLOSSARY.md` as soon as they're settled (terms
   only, no implementation notes). Hard-to-reverse choices get a short ADR in
   `docs/adr/` (the domain-modeling skill has the format).
2. **Build against golden walks.** Each feature gets walks in an example
   project: the moves, and what each Screen must and must not show.
   `codezoom walk walks/*.walk.json` replays them.
3. **Show the maintainer before committing.** Summarize what changed and what
   you checked, then wait for a go-ahead. Never commit or push without one.
4. **Commit only your own files.** Other sessions may be working in the same
   checkout; stage paths explicitly, never `git add -A`. Keep code and docs in
   separate commits when both change.

## Checks

Run from `codezoom/` (Node.js 22.23 or newer; older versions crash inside
tree-sitter's native binding):

```bash
npm ci
npm run build      # the tests start the server, which needs the built page
npm run check      # TypeScript and Svelte type check
npm test           # unit, MCP and golden-walk tests; no Unity or .NET SDK needed
npm publish --dry-run
```

Then replay every example's walks:

```bash
cd ../examples/TinyTowers && node ../../codezoom/bin/codezoom.js walk walks/*.walk.json --no-cache
cd ../TinyShop && node ../../codezoom/bin/codezoom.js walk walks/*.walk.json --no-cache
```

CI (`.github/workflows/ci.yml`) runs build, check, test and pack on Ubuntu
and macOS with Node 22 and 24 for every push to `main` and every pull
request. Windows is left out until `build:server` stops using `rm -rf`.

After changing an example project, refresh its foreign-type list in
`codezoom/test/fixtures/` (see "Developing" in `codezoom/README.md`).

## Releasing

1. Bump `version` in `codezoom/package.json`. Update the "New in" line in
   `codezoom/README.md`, the Status section of `README.md`, and
   `docs/index.html` (the label under the title, "Where it stands" and the
   timeline).
2. Run all the checks above, plus the name scan below. Show the maintainer.
3. Commit (code, then docs) and push. Wait for CI to pass.
4. **The maintainer publishes**, from `codezoom/`, with `npm publish`
   (two-factor sign-in with a passkey). Agents never publish.
5. Verify: `npm view codezoom version`, then install the new version from the
   registry into an empty folder and replay the walks with that copy.
6. Tag the code commit the package was built from:
   `git tag -a vX.Y.Z <commit> -m "codezoom X.Y.Z"`, then push the tag.
7. Draft GitHub Release notes, show them to the maintainer, then publish with
   `gh release create vX.Y.Z --verify-tag --title "codezoom X.Y.Z" --notes-file … --latest`.

GitHub Pages redeploys on its own when `docs/` changes on `main`.

## Rules

- **No work-project names.** The maintainer's employer's projects, studio and
  code namespaces must never appear in this repo: not in files, commit
  messages, release notes, the npm package or the overview page. Say "a large
  production project" instead. The maintainer's own 2d-space-survival, and the
  made-up TinyTowers and TinyShop, are fine to name. If you are unsure whether
  a name is allowed, ask before writing it. Before every commit and release,
  scan staged files and the packed tarball for the names the maintainer has
  given you.
- **History is public.** The repo, its Pages site and the npm package are
  public. Anything committed should be fit to publish.
- **Credits stay.** Keep the Credits sections that name Uncle Bob, Matt
  Pocock and the livestream that started the project.
- **Generated folders stay out:** `dist/`, `node_modules/`, `.codezoom/`
  caches, Unity's `Library/` and `Temp/`, .NET's `bin/` and `obj/`, `.idea/`.
