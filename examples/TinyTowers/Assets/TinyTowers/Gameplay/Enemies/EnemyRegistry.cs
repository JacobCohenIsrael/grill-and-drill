using System.Collections.Generic;
using TinyTowers.Core;
using UnityEngine;

namespace TinyTowers.Enemies
{
    /// Every enemy alive right now, so towers never search the scene.
    public static class EnemyRegistry
    {
        private static readonly List<Enemy> alive = new List<Enemy>();
        private static readonly List<ITargetable> scratch = new List<ITargetable>();

        public static int Count => alive.Count;
        public static void Add(Enemy enemy) => alive.Add(enemy);
        public static void Remove(Enemy enemy) => alive.Remove(enemy);

        public static IReadOnlyList<ITargetable> InRange(Vector3 from, float range, bool includeFlying)
        {
            scratch.Clear();
            foreach (var enemy in alive)
            {
                if (!includeFlying && enemy is Bat) continue;
                if (Vector3.Distance(from, enemy.Position) <= range) scratch.Add(enemy);
            }
            return scratch;
        }

        public static void ForEachWithin(Vector3 center, float radius, System.Action<Enemy> action)
        {
            foreach (var enemy in alive.ToArray())
                if (Vector3.Distance(center, enemy.Position) <= radius) action(enemy);
        }
    }
}
