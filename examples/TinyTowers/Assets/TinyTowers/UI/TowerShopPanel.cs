using TinyTowers.Economy;
using TinyTowers.Towers;
using UnityEngine;
using UnityEngine.UIElements;

namespace TinyTowers.UI
{
    /// One button per tower; greyed out when the player cannot afford it.
    public class TowerShopPanel : MonoBehaviour
    {
        [SerializeField] private UIDocument document;
        private TowerShop shop;
        private TowerConfig selected;

        public void Bind(TowerShop towerShop)
        {
            shop = towerShop;
            var list = document.rootVisualElement.Q<VisualElement>("shop");
            foreach (TowerConfig tower in shop.Catalog)
            {
                var button = new Button(() => selected = tower) { text = $"{tower.displayName} ({tower.cost})" };
                list.Add(button);
            }
        }

        public void PlaceSelected(Vector3 at)
        {
            if (selected != null) shop.Buy(selected, at);
        }
    }
}
