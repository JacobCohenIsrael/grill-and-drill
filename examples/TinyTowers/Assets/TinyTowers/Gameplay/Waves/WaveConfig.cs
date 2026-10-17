using System;
using System.Collections.Generic;
using TinyTowers.Enemies;
using UnityEngine;

namespace TinyTowers.Waves
{
    [Serializable]
    public class SpawnGroup
    {
        public EnemyConfig enemy;
        public int count = 5;
        public float interval = 0.6f;
        public float delayBefore;
    }

    [CreateAssetMenu(menuName = "TinyTowers/Wave")]
    public class WaveConfig : ScriptableObject
    {
        public List<SpawnGroup> groups = new List<SpawnGroup>();
        public int clearBonus = 25;
    }
}
