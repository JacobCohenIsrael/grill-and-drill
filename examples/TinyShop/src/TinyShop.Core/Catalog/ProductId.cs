namespace TinyShop.Catalog;

public readonly record struct ProductId(string Value)
{
    public override string ToString() => Value;
}
