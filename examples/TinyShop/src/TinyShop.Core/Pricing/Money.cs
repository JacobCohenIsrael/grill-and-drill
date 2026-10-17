namespace TinyShop.Pricing;

public readonly record struct Money(decimal Amount, string Currency)
{
    public static Money Zero(string currency) => new(0, currency);

    public static Money operator +(Money a, Money b) => new(a.Amount + Same(a, b).Amount, a.Currency);

    public static Money operator -(Money a, Money b) => new(a.Amount - Same(a, b).Amount, a.Currency);

    public static Money operator *(Money a, int times) => new(a.Amount * times, a.Currency);

    public Money Percent(decimal percent) => new(Math.Round(Amount * percent / 100, 2), Currency);

    public override string ToString() => $"{Amount:0.00} {Currency}";

    private static Money Same(Money a, Money b) =>
        a.Currency == b.Currency ? b : throw new InvalidOperationException($"Cannot mix {a.Currency} and {b.Currency}");
}
