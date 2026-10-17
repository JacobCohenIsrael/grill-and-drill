using TinyTowers.Core;
using TinyTowers.Enemies;
using UnityEngine;

namespace TinyTowers.Towers
{
    public class SlowEffect : MonoBehaviour
    {
        private PathFollower follower;
        private float until;

        public static void Apply(GameObject target, float multiplier, float seconds)
        {
            var effect = target.GetComponent<SlowEffect>() ?? target.AddComponent<SlowEffect>();
            effect.follower = target.GetComponent<PathFollower>();
            effect.follower.SpeedMultiplier = multiplier;
            effect.until = GameClock.Instance.Now + seconds;
        }

        private void Update()
        {
            if (GameClock.Instance.Now < until) return;
            follower.SpeedMultiplier = 1f;
            Destroy(this);
        }
    }
}
