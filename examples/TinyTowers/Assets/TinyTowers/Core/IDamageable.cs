namespace TinyTowers.Core
{
    /// Anything a projectile can hurt.
    public interface IDamageable
    {
        bool IsAlive { get; }
        void TakeDamage(int amount);
    }
}
