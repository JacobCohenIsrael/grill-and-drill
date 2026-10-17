using TinyShop.Catalog;

namespace TinyShop.Legacy;

/// Before the pricing rules. Kept to read, left out of the build.
public static class OldPricing
{
    public static decimal PriceOf(Product product, int quantity) => product.Price.Amount * quantity * (quantity >= 5 ? 0.9m : 1m);
}
