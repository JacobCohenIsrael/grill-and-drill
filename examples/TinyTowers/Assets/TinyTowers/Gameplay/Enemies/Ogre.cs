using TinyTowers.Core;

namespace TinyTowers.Enemies
{
    /// Slow and armored; splits into two goblins when it dies.
    public class Ogre : Enemy
    {
        public EnemyConfig splitInto;
        public Path pathForSplits;

        protected override void OnDied(Health h)
        {
            for (int i = 0; i < 2; i++)
            {
                var goblin = Instantiate(splitInto.prefab, transform.position, transform.rotation);
                goblin.Spawn(splitInto, pathForSplits);
            }
            base.OnDied(h);
        }
    }
}
