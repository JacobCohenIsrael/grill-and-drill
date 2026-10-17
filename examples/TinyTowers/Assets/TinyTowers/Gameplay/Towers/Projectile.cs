using TinyTowers.Core;
using UnityEngine;

namespace TinyTowers.Towers
{
    public class Projectile : MonoBehaviour
    {
        [SerializeField] private float speed = 12f;
        private ITargetable target;
        private int damage;
        private System.Action<Vector3> onImpact;

        public void Launch(ITargetable at, int dmg, System.Action<Vector3> impact = null)
        {
            target = at;
            damage = dmg;
            onImpact = impact;
        }

        private void Update()
        {
            if (target == null || !target.Damageable.IsAlive) { Destroy(gameObject); return; }
            transform.position = Vector3.MoveTowards(transform.position, target.Position, speed * GameClock.Instance.Delta);
            if (Vector3.Distance(transform.position, target.Position) > 0.1f) return;
            target.Damageable.TakeDamage(damage);
            onImpact?.Invoke(transform.position);
            Destroy(gameObject);
        }
    }
}
