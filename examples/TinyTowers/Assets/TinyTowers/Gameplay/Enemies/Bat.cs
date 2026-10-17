namespace TinyTowers.Enemies
{
    /// Flies over the path: only towers that can hit air see it.
    public class Bat : Enemy
    {
        public bool IsFlying => true;
    }
}
