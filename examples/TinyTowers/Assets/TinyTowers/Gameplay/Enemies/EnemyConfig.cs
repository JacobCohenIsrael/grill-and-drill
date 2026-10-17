using UnityEngine;

namespace TinyTowers.Enemies
{
    [CreateAssetMenu(menuName = "TinyTowers/Enemy")]
    public class EnemyConfig : ScriptableObject
    {
        public string displayName = "Goblin";
        public int maxHealth = 10;
        public int armor;
        public float speed = 2f;
        public int bounty = 5;
        public int leakDamage = 1;
        public Enemy prefab;
    }
}
