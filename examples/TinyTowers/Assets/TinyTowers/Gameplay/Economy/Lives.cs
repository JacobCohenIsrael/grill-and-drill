using System;
using TinyTowers.Core;

namespace TinyTowers.Economy
{
    public class Lives
    {
        public const int MaxLives = 99;
        public int Remaining { get; private set; }
        public event Action GameOver;

        public Lives(int start)
        {
            Remaining = start;
            EventBus.Subscribe<EnemyLeaked>(OnLeak);
        }

        /// Sets the lives outright, for a loaded save; returns how far they moved.
        public int Restore(int saved)
        {
            if (saved < 0 || saved == Remaining) return 0;
            if (saved > MaxLives) saved = MaxLives;
            var moved = saved - Remaining;
            Remaining = saved;
            EventBus.Publish(new LivesChanged(Remaining));
            return moved;
        }

        private void OnLeak(EnemyLeaked leak)
        {
            Remaining = Math.Max(0, Remaining - leak.Damage);
            EventBus.Publish(new LivesChanged(Remaining));
            if (Remaining == 0) GameOver?.Invoke();
        }
    }
}
