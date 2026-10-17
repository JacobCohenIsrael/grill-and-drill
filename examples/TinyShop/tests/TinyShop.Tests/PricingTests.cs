using TinyShop.Catalog;
using TinyShop.Customers;
using TinyShop.Orders;
using TinyShop.Pricing;

namespace TinyShop.Tests;

public class PricingTests
{
    private static readonly Customer Ada = new(new CustomerId(1), "Ada", "EUR");

    [Fact]
    public void Bulk_discount_needs_enough_items()
    {
        var order = new Order(OrderId.New(), Ada);
        order.Add(new OrderLine(new ProductId("cup"), 4, new Money(6, "EUR")));
        Assert.Equal(Money.Zero("EUR"), new BulkDiscount(5, 10).DiscountFor(order));
        order.Add(new OrderLine(new ProductId("cup"), 1, new Money(6, "EUR")));
        Assert.Equal(new Money(3, "EUR"), new BulkDiscount(5, 10).DiscountFor(order));
    }

    [Fact]
    public void Money_does_not_mix_currencies() =>
        Assert.Throws<InvalidOperationException>(() => new Money(1, "EUR") + new Money(1, "USD"));
}
