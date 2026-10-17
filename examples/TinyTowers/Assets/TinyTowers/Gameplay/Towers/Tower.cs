using System.Collections.Generic;
using TinyTowers.Core;
using TinyTowers.Enemies;
using UnityEngine;

namespace TinyTowers.Towers
{
    /// A built tower: finds a target in range on a timer and fires at it.
    public abstract class Tower : MonoBehaviour
    {
        [SerializeField] protected TowerConfig config;
        [SerializeField] private Transform muzzle;
        protected ITargetingStrategy targeting = new FurthestAlong();
        private float cooldown;

        public TowerConfig Config => config;
        public int Level { get; private set; } = 1;
        public ITargetable CurrentTarget { get; private set; }

        public void Place(TowerConfig cfg)
        {
            config = cfg;
            cooldown = cfg.fireInterval;
        }

        protected virtual void Update()
        {
            cooldown -= GameClock.Instance.Delta;
            if (cooldown > 0f) return;
            IReadOnlyList<ITargetable> inRange = EnemyRegistry.InRange(transform.position, config.range, config.hitsFlying);
            CurrentTarget = targeting.Pick(inRange);
            if (CurrentTarget == null) return;
            Fire(CurrentTarget);
            cooldown = config.fireInterval;
        }

        protected virtual void Fire(ITargetable target)
        {
            var shot = Instantiate(config.projectile, muzzle.position, Quaternion.identity);
            shot.Launch(target, config.damage, OnImpact);
            if (target is Goblin goblin) goblin.OnHit();
        }

        protected virtual void OnImpact(Vector3 point) { }

        public bool CanUpgrade => config.upgrade != null;

        public void Upgrade()
        {
            if (!CanUpgrade) return;
            config = config.upgrade;
            Level++;
        }

        public bool InRange(ITargetable target) => Vector3.Distance(transform.position, target.Position) <= config.range;

        public int SellValue => config.cost * Level / 2;

        private void OnDrawGizmosSelected()
        {
            if (config == null) return;
            Gizmos.DrawWireSphere(transform.position, config.range);
            if (CurrentTarget != null && InRange(CurrentTarget)) Gizmos.DrawLine(transform.position, CurrentTarget.Position);
        }
    }
}
