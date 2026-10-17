using TinyTowers.Core;
using UnityEngine.UIElements;

namespace TinyTowers.UI
{
    public class LivesLabel
    {
        private readonly Label label;
        public LivesLabel(Label label) => this.label = label;
        public void Show(LivesChanged e) => label.text = $"♥ {e.Lives}";
    }
}
