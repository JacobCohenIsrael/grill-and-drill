using UnityEngine;

namespace TinyTowers.Core
{
    /// Anything a tower can aim at.
    public interface ITargetable
    {
        Vector3 Position { get; }
        float DistanceToGoal { get; }
        IDamageable Damageable { get; }
    }
}
