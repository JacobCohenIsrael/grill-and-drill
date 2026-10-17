using UnityEngine;

namespace TinyTowers.Save
{
    public class PlayerPrefsStore : ISaveStore
    {
        public int GetInt(string key, int fallback) => PlayerPrefs.GetInt(key, fallback);

        public void SetInt(string key, int value)
        {
            PlayerPrefs.SetInt(key, value);
            PlayerPrefs.Save();
        }
    }
}
