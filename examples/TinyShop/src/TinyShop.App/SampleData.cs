using Microsoft.Extensions.Logging;
using TinyShop.Catalog;
using TinyShop.Customers;
using TinyShop.Orders;
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

    /// The demo's order, placed by hand: written before OrderService existed, and never removed.
    public static Order PlaceByHand(IProductCatalog catalog, IOrderRepository orders, ILogger log, Customer customer, IReadOnlyDictionary<ProductId, int> basket)
    {
        var order = new Order(OrderId.New(), customer);
        foreach (var (id, quantity) in basket)
        {
            var product = catalog.Find(id) ?? throw new UnknownProductException(id);
            catalog.Reserve(id, quantity);
            order.Add(product, quantity);
        }
        orders.Save(order);
        log.LogInformation("Placed order {Order} for {Customer}", order.Id, customer.Name);
        return order;
    }
}
