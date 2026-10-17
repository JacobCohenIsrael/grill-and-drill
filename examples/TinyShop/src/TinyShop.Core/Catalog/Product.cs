using TinyShop.Pricing;

namespace TinyShop.Catalog;

public sealed record Product(ProductId Id, string Name, Money Price, int Stock);
