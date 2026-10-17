using TinyTowers.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace TinyTowers.UI
{
    /// Binds game events to the HUD document.
    public class HudPresenter : MonoBehaviour
    {
        [SerializeField] private UIDocument document;
        private GoldLabel gold;
        private LivesLabel lives;
        private WaveBanner banner;

        private void OnEnable()
        {
            var root = document.rootVisualElement;
            gold = new GoldLabel(root.Q<Label>("gold"));
            lives = new LivesLabel(root.Q<Label>("lives"));
            banner = new WaveBanner(root.Q<Label>("banner"));
            EventBus.Subscribe<GoldChanged>(gold.Show);
            EventBus.Subscribe<LivesChanged>(lives.Show);
            EventBus.Subscribe<WaveStarted>(banner.Announce);
        }

        private void OnDisable()
        {
            EventBus.Unsubscribe<GoldChanged>(gold.Show);
            EventBus.Unsubscribe<LivesChanged>(lives.Show);
            EventBus.Unsubscribe<WaveStarted>(banner.Announce);
        }
    }
}
