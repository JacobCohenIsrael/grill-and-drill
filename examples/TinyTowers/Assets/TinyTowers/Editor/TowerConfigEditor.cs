using TinyTowers.Towers;
using UnityEditor;
using UnityEngine;

namespace TinyTowers.Editor
{
    [CustomEditor(typeof(TowerConfig))]
    public class TowerConfigEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();
            var config = (TowerConfig)target;
            float dps = config.damage / Mathf.Max(0.01f, config.fireInterval);
            EditorGUILayout.HelpBox($"Damage per second: {dps:0.0}", MessageType.Info);
        }
    }
}
