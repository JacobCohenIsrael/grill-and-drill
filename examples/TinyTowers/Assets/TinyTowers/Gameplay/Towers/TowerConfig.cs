using UnityEngine;

namespace TinyTowers.Towers
{
    [CreateAssetMenu(menuName = "TinyTowers/Tower")]
    public class TowerConfig : ScriptableObject
    {
        public string displayName = "Arrow Tower";
        public int cost = 50;
        public float range = 4f;
        public float fireInterval = 0.8f;
        public int damage = 3;
        public bool hitsFlying = true;
        public Projectile projectile;
        public Tower prefab;
        public TowerConfig upgrade;
    }
}
