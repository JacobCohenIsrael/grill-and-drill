using TinyTowers.Core;

namespace TinyTowers.Economy
{
    /// The player's gold. Earns bounties and wave bonuses, pays for towers.
    public class Wallet
    {
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

        public bool TrySpend(int amount)
        {
            if (amount > Gold) return false;
            Gold -= amount;
            EventBus.Publish(new GoldChanged(Gold));
            return true;
        }
    }
}
