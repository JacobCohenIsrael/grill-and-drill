using TinyTowers.Enemies;
using TinyTowers.Waves;
using UnityEditor;
using UnityEngine;

namespace TinyTowers.Editor
{
    public class WaveDebugWindow : EditorWindow
    {
        [MenuItem("TinyTowers/Wave Debugger")]
        private static void Open() => GetWindow<WaveDebugWindow>("Waves");

        private void OnGUI()
        {
            var spawner = Object.FindFirstObjectByType<WaveSpawner>();
            if (spawner == null) { EditorGUILayout.LabelField("No WaveSpawner in the scene."); return; }
            EditorGUILayout.LabelField($"Wave {spawner.CurrentWave} / {spawner.WaveCount}");
            EditorGUILayout.LabelField($"Enemies alive: {EnemyRegistry.Count}");
        }
    }
}
