using TinyTowers.Core;
using UnityEngine;

namespace TinyTowers.Towers
{
    /// Does little damage but slows what it hits.
    public class FrostTower : Tower
    {
        [SerializeField] private float slowFor = 2f;

        protected override void Fire(ITargetable target)
        {
            base.Fire(target);
            if (target is Component c) SlowEffect.Apply(c.gameObject, 0.5f, slowFor);
            ChillNear(target.Position);
        }

        /// From level 2 on, everything near the target is chilled as well.
        private int ChillNear(Vector3 point)
        {
            if (Level < 2) return 0;
            var hits = 0;
            foreach (var hit in Physics.OverlapSphere(point, config.range / 4f))
            {
                if (!hit.CompareTag("Enemy") || hit.transform == transform) continue;
                hit.SendMessage("Chill", slowFor / 2f, SendMessageOptions.DontRequireReceiver);
                hits++;
            }
            return hits;
        }
    }
}
