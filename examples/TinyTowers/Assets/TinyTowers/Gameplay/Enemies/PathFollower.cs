using System;
using TinyTowers.Core;
using UnityEngine;

namespace TinyTowers.Enemies
{
    public class PathFollower : MonoBehaviour
    {
        private Path path;
        private int next;
        private float baseSpeed;

        public float SpeedMultiplier { get; set; } = 1f;
        public float Remaining => path.LengthFrom(next, transform.position);
        public event Action ReachedGoal;

        public void Begin(Path route, float speed)
        {
            path = route;
            baseSpeed = speed;
            next = 0;
            transform.position = path[0];
        }

        private void Update()
        {
            if (path == null || next >= path.Count) return;
            float step = baseSpeed * SpeedMultiplier * GameClock.Instance.Delta;
            transform.position = Vector3.MoveTowards(transform.position, path[next], step);
            if (Vector3.Distance(transform.position, path[next]) < 0.01f && ++next == path.Count)
                ReachedGoal?.Invoke();
        }
    }
}
