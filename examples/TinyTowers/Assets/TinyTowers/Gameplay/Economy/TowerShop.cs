using System.Collections.Generic;
using System.Linq;
using TinyTowers.Towers;
using UnityEngine;

namespace TinyTowers.Economy
{
    /// What the player can build right now, and the act of buying it.
    public class TowerShop
    {
        private readonly IReadOnlyList<TowerConfig> catalog;
        private readonly Wallet wallet;
        private readonly BuildGrid grid;

        public TowerShop(IReadOnlyList<TowerConfig> towers, Wallet wallet, BuildGrid grid)
        {
            catalog = towers;
            this.wallet = wallet;
            this.grid = grid;
        }

        public IEnumerable<TowerConfig> Affordable => catalog.Where(t => t.cost <= wallet.Gold);
        public IReadOnlyList<TowerConfig> Catalog => catalog;

        public Tower Buy(TowerConfig tower, Vector3 at) => grid.Build(tower, grid.CellAt(at), wallet);

        public bool TryUpgrade(Tower tower)
        {
            if (!tower.CanUpgrade || !wallet.TrySpend(tower.Config.upgrade.cost)) return false;
            tower.Upgrade();
            return true;
        }
    }
}
