using Newtonsoft.Json;
using TinyShop.Customers;
using TinyShop.Orders;

namespace TinyShop.Storage;

/// Keeps each order as a JSON file in one folder.
public sealed class JsonOrderRepository : IOrderRepository
{
    private readonly string folder;
    private readonly JsonSerializerSettings settings;

    public JsonOrderRepository(string folder)
    {
        this.folder = folder;
        settings = new JsonSerializerSettings { Formatting = Formatting.Indented };
        settings.Converters.Add(new OrderJsonConverter());
        Directory.CreateDirectory(folder);
    }

    public Order? Find(OrderId id)
    {
        var path = PathOf(id);
        return File.Exists(path) ? JsonConvert.DeserializeObject<Order>(File.ReadAllText(path), settings) : null;
    }

    public void Save(Order order) => File.WriteAllText(PathOf(order.Id), JsonConvert.SerializeObject(order, settings));

    public IEnumerable<Order> ForCustomer(CustomerId customer) =>
        Directory.EnumerateFiles(folder, "*.json")
            .Select(f => JsonConvert.DeserializeObject<Order>(File.ReadAllText(f), settings))
            .OfType<Order>()
            .Where(o => o.Customer.Id == customer);

    private string PathOf(OrderId id) => Path.Combine(folder, $"{id.Value:N}.json");
}
