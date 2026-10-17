---
status: accepted
---

# A TypeScript tool from npm with a browser UI, Unity C# first

The tool is a TypeScript/Node package installed from npm and set up by a
wizard, and it shows the diagram as an interactive HTML page in the browser.
Unity C# projects are the primary target; Node/TypeScript projects come
second. We picked one Node tool with a web UI so a single install serves both
kinds of project the author works in, even though a C#-native tool would read
C# more easily. How C# is read from Node is a separate decision.

## Considered Options

- **A C# tool built on Roslyn.** Reads C# best, but needs the .NET SDK and
  does nothing for Node projects.
- **A Unity Editor window.** Close to the code and scenes, but only works
  inside the Unity Editor and only for Unity projects.
- **Fork Uncle Bob's uml-viewer.** It is Clojure on the JVM, has no C#
  reader, and its views descend a namespace tree instead of re-centring on a
  node. We borrow its ideas but share no code and no data format with it.
