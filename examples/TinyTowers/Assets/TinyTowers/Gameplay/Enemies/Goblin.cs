using UnityEngine;

namespace TinyTowers.Enemies
{
    /// Fast and fragile; sprints for a moment when first hit.
    public class Goblin : Enemy
    {
        [SerializeField] private float sprintMultiplier = 1.8f;
        private bool sprinted;

        public override void Spawn(EnemyConfig cfg, Path path)
        {
            base.Spawn(cfg, path);
            sprinted = false;
        }

        public void OnHit()
        {
            if (sprinted) return;
            sprinted = true;
            follower.SpeedMultiplier = sprintMultiplier;
            Invoke(nameof(EndSprint), 1.5f);
        }

        private void EndSprint() => follower.SpeedMultiplier = 1f;
    }
}
