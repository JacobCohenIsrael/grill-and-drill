using TinyShop.Catalog;
using TinyShop.Pricing;

namespace TinyShop.App;

static class SampleData
{
    public static readonly ProductId Teapot = new("teapot");
    public static readonly ProductId Cup = new("cup");

    public static IEnumerable<Product> Products() =>
    [
        new Product(Teapot, "Teapot", new Money(24.50m, "EUR"), Stock: 3),
        new Product(Cup, "Cup", new Money(6.00m, "EUR"), Stock: 40),
    ];
}
