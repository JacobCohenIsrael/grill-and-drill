using TinyShop.Orders;

namespace TinyShop.Pricing;

/// A fixed amount off, once a customer has entered the code.
public sealed class CouponDiscount(string code, Money off) : IPricingRule
{
    public string Name => $"Coupon {code}";

    public Money DiscountFor(Order order) =>
        order.Coupons.Contains(code) && off.Currency == order.Currency ? off : Money.Zero(order.Currency);
}
