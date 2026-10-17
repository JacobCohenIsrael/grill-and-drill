using Microsoft.Extensions.Logging;
using TinyShop.Catalog;
using TinyShop.Customers;
using TinyShop.Pricing;

namespace TinyShop.Orders;

/// Places, prices and cancels orders.
public sealed class OrderService(IOrderRepository orders, IProductCatalog catalog, IEnumerable<IPricingRule> rules, ILogger<OrderService> log)
{
    public Order Place(Customer customer, IReadOnlyDictionary<ProductId, int> basket)
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

    public Money Total(Order order)
    {
        var discount = rules.Aggregate(Money.Zero(order.Currency), (sum, rule) => sum + rule.DiscountFor(order));
        return order.Subtotal - discount;
    }

    public void Cancel(OrderId id)
    {
        var order = orders.Find(id) ?? throw new KeyNotFoundException($"No order {id}");
        order.Cancel();
        orders.Save(order);
        log.LogInformation("Cancelled order {Order}", id);
    }
}
