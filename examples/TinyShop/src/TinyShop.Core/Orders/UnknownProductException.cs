using TinyShop.Catalog;

namespace TinyShop.Orders;

public sealed class UnknownProductException(ProductId product) : Exception($"No product {product}")
{
    public ProductId Product { get; } = product;
}
