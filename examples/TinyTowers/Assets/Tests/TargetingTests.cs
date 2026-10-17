using NUnit.Framework;
using TinyTowers.Towers;

namespace TinyTowers.Tests
{
    public class TargetingTests
    {
        [Test]
        public void NoCandidatesMeansNoTarget()
        {
            Assert.IsNull(new FurthestAlong().Pick(new TinyTowers.Core.ITargetable[0]));
        }
    }
}
