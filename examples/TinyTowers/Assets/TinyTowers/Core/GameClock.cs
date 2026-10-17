using UnityEngine;

namespace TinyTowers.Core
{
    /// Game time that can be paused or fast-forwarded without touching Time.timeScale.
    public class GameClock : MonoBehaviour
    {
        public static GameClock Instance { get; private set; }

        [SerializeField] private float speed = 1f;
        public bool Paused { get; set; }
        public float Delta => Paused ? 0f : Time.deltaTime * speed;
        public float Now { get; private set; }

        private void Awake() => Instance = this;
        private void Update() => Now += Delta;

        public void SetSpeed(float value) => speed = Mathf.Clamp(value, 0.5f, 3f);
    }
}
