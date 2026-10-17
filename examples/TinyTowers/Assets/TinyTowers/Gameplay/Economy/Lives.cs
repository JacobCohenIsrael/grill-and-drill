using System;
using TinyTowers.Core;

namespace TinyTowers.Economy
{
    public class Lives
    {
        public int Remaining { get; private set; }
        public event Action GameOver;

        public Lives(int start)
        {
            Remaining = start;
            EventBus.Subscribe<EnemyLeaked>(OnLeak);
        }

        private void OnLeak(EnemyLeaked leak)
        {
            Remaining = Math.Max(0, Remaining - leak.Damage);
            EventBus.Publish(new LivesChanged(Remaining));
            if (Remaining == 0) GameOver?.Invoke();
        }
    }
}
