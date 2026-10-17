using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using TinyShop.Catalog;
using TinyShop.Customers;
using TinyShop.Orders;
using TinyShop.Pricing;

namespace TinyShop.Storage;

/// Orders keep their lines private: write and read them by hand.
public sealed class OrderJsonConverter : JsonConverter<Order>
{
    public override void WriteJson(JsonWriter writer, Order? value, JsonSerializer serializer)
    {
        if (value is null)
        {
            writer.WriteNull();
            return;
        }
        var json = new JObject
        {
            ["id"] = value.Id.Value,
            ["customer"] = JObject.FromObject(value.Customer),
            ["status"] = value.Status.ToString(),
            ["lines"] = new JArray(value.Lines.Select(l => new JObject
            {
                ["product"] = l.Product.Value,
                ["quantity"] = l.Quantity,
                ["price"] = l.UnitPrice.Amount,
            })),
        };
        json.WriteTo(writer);
    }

    public override Order? ReadJson(JsonReader reader, Type objectType, Order? existingValue, bool hasExistingValue, JsonSerializer serializer)
    {
        var json = JObject.Load(reader);
        var customer = json["customer"]!.ToObject<Customer>()!;
        var order = new Order(new OrderId(json.Value<Guid>("id")), customer);
        foreach (var line in json["lines"]!.Children<JObject>())
        {
            var price = new Money(line.Value<decimal>("price"), customer.Currency);
            order.Add(new OrderLine(new ProductId(line.Value<string>("product")!), line.Value<int>("quantity"), price));
        }
        return order;
    }
}
