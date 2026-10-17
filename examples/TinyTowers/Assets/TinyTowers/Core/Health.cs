using System;
using UnityEngine;

namespace TinyTowers.Core
{
    public class Health : MonoBehaviour, IDamageable
    {
        [SerializeField] private int max = 10;
        [SerializeField] private int armor;
        private int current;

        public event Action<Health> Died;

        public bool IsAlive => current > 0;
        public float Fraction => (float)current / max;

        public void ResetTo(int value, int armorValue)
        {
            max = value;
            armor = armorValue;
            current = value;
        }

        public void TakeDamage(int amount)
        {
            if (!IsAlive) return;
            current = Mathf.Max(0, current - Mathf.Max(1, amount - armor));
            if (current == 0) Died?.Invoke(this);
        }
    }
}
