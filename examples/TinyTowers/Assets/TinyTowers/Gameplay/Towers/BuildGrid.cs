using System.Collections.Generic;
using TinyTowers.Economy;
using UnityEngine;

namespace TinyTowers.Towers
{
    /// The tiles towers can stand on.
    public class BuildGrid : MonoBehaviour
    {
        [SerializeField] private float cellSize = 1f;
        private readonly Dictionary<Vector2Int, Tower> built = new Dictionary<Vector2Int, Tower>();

        public Vector2Int CellAt(Vector3 world) => new Vector2Int(Mathf.FloorToInt(world.x / cellSize), Mathf.FloorToInt(world.z / cellSize));
        public bool IsFree(Vector2Int cell) => !built.ContainsKey(cell);

        public Tower Build(TowerConfig cfg, Vector2Int cell, Wallet wallet)
        {
            if (!IsFree(cell) || !wallet.TrySpend(cfg.cost)) return null;
            var position = new Vector3((cell.x + 0.5f) * cellSize, 0f, (cell.y + 0.5f) * cellSize);
            var tower = Instantiate(cfg.prefab, position, Quaternion.identity, transform);
            tower.Place(cfg);
            built[cell] = tower;
            return tower;
        }

        public void Sell(Vector2Int cell, Wallet wallet)
        {
            if (!built.TryGetValue(cell, out var tower)) return;
            wallet.Earn(tower.SellValue);
            built.Remove(cell);
            Destroy(tower.gameObject);
        }
    }
}
