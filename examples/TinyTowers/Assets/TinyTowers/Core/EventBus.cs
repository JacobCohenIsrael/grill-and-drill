using System;
using System.Collections.Generic;

namespace TinyTowers.Core
{
    /// A tiny publish/subscribe hub so gameplay and UI never reference each other.
    public static class EventBus
    {
        private static readonly Dictionary<Type, List<Delegate>> handlers = new Dictionary<Type, List<Delegate>>();

        public static void Subscribe<T>(Action<T> handler)
        {
            if (!handlers.TryGetValue(typeof(T), out var list))
                handlers[typeof(T)] = list = new List<Delegate>();
            list.Add(handler);
        }

        public static void Unsubscribe<T>(Action<T> handler)
        {
            if (handlers.TryGetValue(typeof(T), out var list)) list.Remove(handler);
        }

        public static void Publish<T>(T evt)
        {
            if (!handlers.TryGetValue(typeof(T), out var list)) return;
            foreach (var h in list.ToArray()) ((Action<T>)h)(evt);
        }
    }
}
