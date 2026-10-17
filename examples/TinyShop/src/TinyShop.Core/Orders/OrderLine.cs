using TinyShop.Catalog;
using TinyShop.Pricing;

namespace TinyShop.Orders;

public sealed record OrderLine(ProductId Product, int Quantity, Money UnitPrice)
{
    public Money Total => UnitPrice * Quantity;
}
