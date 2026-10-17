using System;
using UnityEngine;

namespace FancyTween
{
    public enum Ease { Linear, OutQuad, OutBack }

    /// A tiny third-party tweening library (stand-in for a vendor SDK).
    public class Tweener
    {
        public float Duration;
        public Ease Ease;
        public Action<float> OnUpdate;
        public Action OnComplete;
        public Tweener SetEase(Ease ease) { Ease = ease; return this; }
        public Tweener Then(Action done) { OnComplete = done; return this; }
    }

    public static class Tween
    {
        public static Tweener Float(float from, float to, float duration, Action<float> apply) =>
            new Tweener { Duration = duration, OnUpdate = t => apply(Mathf.Lerp(from, to, t)) };

        public static Tweener Punch(Transform target, float strength, float duration) =>
            Float(1f, 1f + strength, duration, s => target.localScale = Vector3.one * s);
    }
}
