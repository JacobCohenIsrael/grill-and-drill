using NUnit.Framework;
using TinyTowers.Economy;

namespace TinyTowers.Tests
{
    public class WalletTests
    {
        [Test]
        public void CannotSpendMoreThanItHas()
        {
            var wallet = new Wallet(10);
            Assert.IsFalse(wallet.TrySpend(11));
            Assert.AreEqual(10, wallet.Gold);
        }
    }
}
