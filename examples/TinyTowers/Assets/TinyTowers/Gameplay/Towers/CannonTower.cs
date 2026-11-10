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
            StaggerNear(point);
        }

        /// From level 2 on, everything near the impact staggers as well.
        private int StaggerNear(Vector3 point)
        {
            if (Level < 2) return 0;
            var hits = 0;
            foreach (var hit in Physics.OverlapSphere(point, config.range / 4f))
            {
                if (!hit.CompareTag("Enemy") || hit.transform == transform) continue;
                hit.SendMessage("Stagger", splashRadius / 2f, SendMessageOptions.DontRequireReceiver);
                hits++;
            }
            return hits;
        }
    }
}
