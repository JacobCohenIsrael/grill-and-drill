# TinyTowers (demo project for codezoom)

A small, made-up Unity tower-defense codebase. It is never opened in Unity:
it exists so codezoom has something realistic to index. It has its own
assemblies, a vendor plugin under `Assets/Plugins`, a test assembly and an
editor assembly, so the setup wizard has real choices to make.

Its Unity assets are written by hand in Unity's text format, with `.meta`
files and fixed GUIDs, so codezoom's asset nodes have something to show:
`Scenes/Level1.unity` (a start button whose UnityEvent calls
`WaveSpawner.Begin`), prefabs under `Prefabs/` (the HUD nests the shop panel,
`ArrowTowerElite` is a variant of `ArrowTower`, and `Tree` is art only, so
not a node), and ScriptableObject configs under `Data/` that two goblin
prefabs share.

```bash
cd examples/TinyTowers
codezoom Tower
codezoom Level1.unity
```
