using TinyShop.Orders;

namespace TinyShop.Pricing;

/// A discount an order may earn.
public interface IPricingRule
{
    string Name { get; }
    Money DiscountFor(Order order);
}
