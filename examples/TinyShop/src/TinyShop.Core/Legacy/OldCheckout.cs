using Microsoft.Extensions.Logging;
using TinyShop.Catalog;
using TinyShop.Customers;
using TinyShop.Orders;

namespace TinyShop.Legacy;

/// The checkout before OrderService. Kept to read, left out of the build.
public static class OldCheckout
{
    public static Order Place(IProductCatalog catalog, IOrderRepository orders, ILogger log, Customer customer, IReadOnlyDictionary<ProductId, int> basket)
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
