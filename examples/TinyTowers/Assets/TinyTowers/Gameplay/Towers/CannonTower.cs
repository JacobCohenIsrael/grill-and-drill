using TinyTowers.Enemies;
using UnityEngine;

namespace TinyTowers.Towers
{
    /// Slow shots that hurt every enemy near the impact.
    public class CannonTower : Tower
    {
        [SerializeField] private float splashRadius = 1.5f;

        private void Awake() => targeting = new FirstInRange();

        protected override void OnImpact(Vector3 point)
        {
            EnemyRegistry.ForEachWithin(point, splashRadius, e => e.Damageable.TakeDamage(config.damage / 2));
        }
    }
}
