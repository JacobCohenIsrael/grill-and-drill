using TinyTowers.Core;
using UnityEngine;

namespace TinyTowers.Enemies
{
    [RequireComponent(typeof(Health), typeof(PathFollower))]
    public class Enemy : MonoBehaviour, ITargetable
    {
        [SerializeField] protected EnemyConfig config;
        protected Health health;
        protected PathFollower follower;

        public EnemyConfig Config => config;
        public Vector3 Position => transform.position;
        public float DistanceToGoal => follower.Remaining;
        public IDamageable Damageable => health;

        public virtual void Spawn(EnemyConfig cfg, Path path)
        {
            config = cfg;
            health = GetComponent<Health>();
            follower = GetComponent<PathFollower>();
            health.ResetTo(cfg.maxHealth, cfg.armor);
            health.Died += OnDied;
            follower.ReachedGoal += OnReachedGoal;
            follower.Begin(path, cfg.speed);
            EnemyRegistry.Add(this);
        }

        protected virtual void OnDied(Health _)
        {
            EventBus.Publish(new EnemyKilled(config.bounty));
            Despawn();
        }

        private void OnReachedGoal()
        {
            EventBus.Publish(new EnemyLeaked(config.leakDamage));
            Despawn();
        }

        protected void Despawn()
        {
            EnemyRegistry.Remove(this);
            Destroy(gameObject);
        }
    }
}
