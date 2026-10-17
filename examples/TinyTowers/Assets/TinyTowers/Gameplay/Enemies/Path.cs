using UnityEngine;

namespace TinyTowers.Enemies
{
    /// The waypoints enemies walk from the spawn to the goal.
    public class Path : MonoBehaviour
    {
        [SerializeField] private Transform[] waypoints;

        public int Count => waypoints.Length;
        public Vector3 this[int i] => waypoints[i].position;

        public float LengthFrom(int index, Vector3 position)
        {
            float length = Vector3.Distance(position, this[index]);
            for (int i = index; i < Count - 1; i++) length += Vector3.Distance(this[i], this[i + 1]);
            return length;
        }
    }
}
