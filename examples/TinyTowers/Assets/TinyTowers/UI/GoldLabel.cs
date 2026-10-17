using FancyTween;
using TinyTowers.Core;
using UnityEngine.UIElements;

namespace TinyTowers.UI
{
    public class GoldLabel
    {
        private readonly Label label;
        public GoldLabel(Label label) => this.label = label;

        public void Show(GoldChanged e)
        {
            label.text = $"{e.Gold} gold";
            Tween.Float(1.2f, 1f, 0.2f, s => label.style.scale = new Scale(new UnityEngine.Vector3(s, s, 1)));
        }
    }
}
