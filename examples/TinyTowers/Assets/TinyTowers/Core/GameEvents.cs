namespace TinyTowers.Core
{
    public readonly struct EnemyKilled
    {
        public readonly int Bounty;
        public EnemyKilled(int bounty) { Bounty = bounty; }
    }

    public readonly struct EnemyLeaked
    {
        public readonly int Damage;
        public EnemyLeaked(int damage) { Damage = damage; }
    }

    public readonly struct WaveStarted
    {
        public readonly int Number;
        public WaveStarted(int number) { Number = number; }
    }

    public readonly struct WaveCleared
    {
        public readonly int Number;
        public WaveCleared(int number) { Number = number; }
    }

    public readonly struct GoldChanged
    {
        public readonly int Gold;
        public GoldChanged(int gold) { Gold = gold; }
    }

    public readonly struct LivesChanged
    {
        public readonly int Lives;
        public LivesChanged(int lives) { Lives = lives; }
    }
}
