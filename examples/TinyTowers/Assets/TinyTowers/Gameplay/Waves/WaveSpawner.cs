using System.Collections;
using TinyTowers.Core;
using TinyTowers.Enemies;
using UnityEngine;

namespace TinyTowers.Waves
{
    /// Runs the waves in order: spawns each group, waits for the field to clear.
    public class WaveSpawner : MonoBehaviour
    {
        [SerializeField] private WaveConfig[] waves;
        [SerializeField] private Path path;
        [SerializeField] private float pauseBetweenWaves = 5f;

        public int CurrentWave { get; private set; }
        public int WaveCount => waves.Length;
        public bool Running { get; private set; }

        public void Begin() => StartCoroutine(RunAll());

        /// Enemies still to come, from wave `from` (counting from 1) to the last.
        public int EnemiesFrom(int from)
        {
            var total = 0;
            for (var w = Mathf.Max(from, 1); w <= waves.Length; w++)
            {
                if (waves[w - 1] == null) continue;
                foreach (var group in waves[w - 1].groups) total += group.count;
            }
            return total;
        }

        /// Seconds of pauses before groups still to come, from wave `from` to the last.
        public float DelayFrom(int from)
        {
            var total = 0f;
            for (var w = Mathf.Max(from, 1); w <= waves.Length; w++)
            {
                if (waves[w - 1] == null) continue;
                foreach (var group in waves[w - 1].groups) total += group.delayBefore;
            }
            return total;
        }

        private IEnumerator RunAll()
        {
            Running = true;
            for (CurrentWave = 1; CurrentWave <= waves.Length; CurrentWave++)
            {
                EventBus.Publish(new WaveStarted(CurrentWave));
                yield return RunWave(waves[CurrentWave - 1]);
                while (EnemyRegistry.Count > 0) yield return null;
                EventBus.Publish(new WaveCleared(CurrentWave));
                yield return Wait(pauseBetweenWaves);
            }
            Running = false;
        }

        private IEnumerator RunWave(WaveConfig wave)
        {
            foreach (var group in wave.groups)
            {
                yield return Wait(group.delayBefore);
                for (int i = 0; i < group.count; i++)
                {
                    Spawn(group.enemy);
                    yield return Wait(group.interval);
                }
            }
        }

        private void Spawn(EnemyConfig config)
        {
            Enemy enemy = Instantiate(config.prefab, path[0], Quaternion.identity);
            enemy.Spawn(config, path);
        }

        private static IEnumerator Wait(float seconds)
        {
            float until = GameClock.Instance.Now + seconds;
            while (GameClock.Instance.Now < until) yield return null;
        }
    }
}
