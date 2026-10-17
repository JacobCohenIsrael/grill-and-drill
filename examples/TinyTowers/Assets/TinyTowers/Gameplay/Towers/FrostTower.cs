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
        }
    }
}
