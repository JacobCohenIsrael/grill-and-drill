using TinyShop.Catalog;
using TinyShop.Customers;
using TinyShop.Pricing;

namespace TinyShop.Orders;

public sealed class Order(OrderId id, Customer customer)
{
    private readonly List<OrderLine> lines = [];
    private readonly HashSet<string> coupons = [];

    public OrderId Id { get; } = id;
    public Customer Customer { get; } = customer;
    public OrderStatus Status { get; private set; } = OrderStatus.Open;
    public IReadOnlyList<OrderLine> Lines => lines;
    public IReadOnlySet<string> Coupons => coupons;
    public string Currency => Customer.Currency;
    public int ItemCount => lines.Sum(l => l.Quantity);
    public Money Subtotal => lines.Aggregate(Money.Zero(Currency), (sum, line) => sum + line.Total);

    public void Add(Product product, int quantity) => Add(new OrderLine(product.Id, quantity, product.Price));

    public void Add(OrderLine line)
    {
        if (Status != OrderStatus.Open) throw new InvalidOperationException($"Order {Id} is {Status}");
        lines.Add(line);
    }

    public void Redeem(string coupon) => coupons.Add(coupon);

    public void Pay() => Status = OrderStatus.Paid;

    public void Cancel()
    {
        if (Status == OrderStatus.Shipped) throw new InvalidOperationException($"Order {Id} has shipped");
        Status = OrderStatus.Cancelled;
    }
}
