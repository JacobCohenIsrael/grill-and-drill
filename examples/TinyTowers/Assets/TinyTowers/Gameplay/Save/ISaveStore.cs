namespace TinyTowers.Save
{
    public interface ISaveStore
    {
        int GetInt(string key, int fallback);
        void SetInt(string key, int value);
    }
}
