using FancyTween;
using TinyTowers.Core;
using UnityEngine.UIElements;

namespace TinyTowers.UI
{
    /// "Wave 3" slides in, waits, fades out.
    public class WaveBanner
    {
        private readonly Label label;
        public WaveBanner(Label label) => this.label = label;

        public void Announce(WaveStarted e)
        {
            label.text = $"Wave {e.Number}";
            Tween.Float(0f, 1f, 0.4f, a => label.style.opacity = a)
                .SetEase(Ease.OutBack)
                .Then(() => Tween.Float(1f, 0f, 0.6f, a => label.style.opacity = a));
        }
    }
}
