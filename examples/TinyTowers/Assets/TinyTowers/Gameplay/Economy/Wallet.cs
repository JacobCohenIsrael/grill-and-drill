using TinyTowers.Core;

namespace TinyTowers.Economy
{
    /// The player's gold. Earns bounties and wave bonuses, pays for towers.
    public class Wallet
    {
        public const int MaxGold = 99999;
        public int Gold { get; private set; }

        public Wallet(int startingGold)
        {
            Gold = startingGold;
            EventBus.Subscribe<EnemyKilled>(e => Earn(e.Bounty));
        }

        public void Earn(int amount)
        {
            Gold += amount;
            EventBus.Publish(new GoldChanged(Gold));
        }

        /// Sets the gold outright, for a loaded save; returns how far it moved.
        public int Restore(int saved)
        {
            if (saved < 0 || saved == Gold) return 0;
            if (saved > MaxGold) saved = MaxGold;
            var moved = saved - Gold;
            Gold = saved;
            EventBus.Publish(new GoldChanged(Gold));
            return moved;
        }

        public bool TrySpend(int amount)
        {
            if (amount > Gold) return false;
            Gold -= amount;
            EventBus.Publish(new GoldChanged(Gold));
            return true;
        }
    }
}
