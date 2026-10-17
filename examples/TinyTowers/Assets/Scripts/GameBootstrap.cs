using TinyTowers.Core;
using TinyTowers.Economy;
using TinyTowers.Save;
using TinyTowers.Towers;
using TinyTowers.UI;
using TinyTowers.Waves;
using UnityEngine;

/// Scene entry point: builds the plain C# services and hands them to the scene objects.
public class GameBootstrap : MonoBehaviour
{
    [SerializeField] private TowerConfig[] towers;
    [SerializeField] private BuildGrid grid;
    [SerializeField] private WaveSpawner spawner;
    [SerializeField] private TowerShopPanel shopPanel;
    [SerializeField] private int startingGold = 120;
    [SerializeField] private int startingLives = 20;

    private Wallet wallet;
    private Lives lives;
    private SaveService save;

    private void Start()
    {
        wallet = new Wallet(startingGold);
        lives = new Lives(startingLives);
        save = new SaveService(new PlayerPrefsStore());
        lives.GameOver += () => GameClock.Instance.Paused = true;
        shopPanel.Bind(new TowerShop(towers, wallet, grid));
        spawner.Begin();
        Debug.Log($"Best wave so far: {save.BestWave}");
    }
}
