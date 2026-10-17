using TinyShop.Customers;

namespace TinyShop.Orders;

public interface IOrderRepository
{
    Order? Find(OrderId id);
    void Save(Order order);
    IEnumerable<Order> ForCustomer(CustomerId customer);
}
