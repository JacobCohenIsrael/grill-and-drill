# TinyShop

A small, made-up .NET 8 solution for trying codezoom on plain C# (not
Unity), and the project its .NET tests and golden walks run against.

- `src/TinyShop.Core`: orders, the catalog, pricing rules and `Money`. It
  takes a logger through `Microsoft.Extensions.Logging.Abstractions`, and its
  `Legacy/` folder is left out of the build with `<Compile Remove>`.
- `src/TinyShop.Storage`: a JSON order store on `Newtonsoft.Json`, and an
  in-memory catalog.
- `src/TinyShop.App`: a console app (top-level statements) that wires it
  together with `Microsoft.Extensions.DependencyInjection`.
- `tests/TinyShop.Tests`: xUnit tests. A test project, so not own code by
  default.

Try it from this folder:

```bash
npx codezoom OrderService
codezoom walk walks/*.walk.json
```

Without a restore, codezoom matches each package by its root namespace and
says so on every Screen. `dotnet restore` makes it exact; the walks pass
either way. The codezoom tests use a committed list of the package and base
library types this solution mentions (`codezoom/test/fixtures`), so they
need no .NET SDK.
