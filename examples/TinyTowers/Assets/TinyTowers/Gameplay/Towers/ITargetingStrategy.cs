using System.Collections.Generic;
using TinyTowers.Core;

namespace TinyTowers.Towers
{
    /// How a tower picks one enemy among those in range.
    public interface ITargetingStrategy
    {
        ITargetable Pick(IReadOnlyList<ITargetable> candidates);
    }
}
