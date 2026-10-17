using TinyTowers.Core;

namespace TinyTowers.Save
{
    /// Remembers the best wave reached across runs.
    public class SaveService
    {
        private const string BestWaveKey = "best-wave";
        private readonly ISaveStore store;

        public SaveService(ISaveStore store)
        {
            this.store = store;
            EventBus.Subscribe<WaveCleared>(e => RecordWave(e.Number));
        }

        public int BestWave => store.GetInt(BestWaveKey, 0);

        private void RecordWave(int number)
        {
            if (number > BestWave) store.SetInt(BestWaveKey, number);
        }
    }
}
