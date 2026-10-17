using TinyShop.Orders;

namespace TinyShop.Pricing;

/// A percentage off orders of many items.
public sealed class BulkDiscount(int minimumItems, decimal percent) : IPricingRule
{
    public string Name => $"{percent}% off {minimumItems} or more items";

    public Money DiscountFor(Order order) =>
        order.ItemCount >= minimumItems ? order.Subtotal.Percent(percent) : Money.Zero(order.Currency);
}
