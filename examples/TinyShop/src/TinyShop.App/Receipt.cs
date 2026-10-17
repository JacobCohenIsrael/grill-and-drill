using TinyShop.Orders;
using TinyShop.Pricing;

namespace TinyShop.App;

static class Receipt
{
    public static void Print(Order order, Money total)
    {
        Console.WriteLine($"Order {order.Id} for {order.Customer.Name}");
        foreach (var line in order.Lines) Console.WriteLine($"  {line.Quantity} x {line.Product,-8} {line.Total}");
        Console.WriteLine($"  subtotal {order.Subtotal}, to pay {total}");
    }
}
