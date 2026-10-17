using System.Collections.Generic;
using TinyTowers.Core;

namespace TinyTowers.Towers
{
    /// Shoots whoever is closest to the goal: the default.
    public class FurthestAlong : ITargetingStrategy
    {
        public ITargetable Pick(IReadOnlyList<ITargetable> candidates)
        {
            ITargetable best = null;
            foreach (var c in candidates)
                if (best == null || c.DistanceToGoal < best.DistanceToGoal) best = c;
            return best;
        }
    }

    /// Shoots the first enemy in the list: cheap, and good enough for splash towers.
    public class FirstInRange : ITargetingStrategy
    {
        public ITargetable Pick(IReadOnlyList<ITargetable> candidates) => candidates.Count > 0 ? candidates[0] : null;
    }
}
