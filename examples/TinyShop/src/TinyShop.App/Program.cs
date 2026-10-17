using Microsoft.Extensions.DependencyInjection;
using TinyShop.App;
using TinyShop.Catalog;
using TinyShop.Customers;
using TinyShop.Orders;
using TinyShop.Pricing;
using TinyShop.Storage;

var services = new ServiceCollection()
    .AddLogging()
    .AddSingleton<IProductCatalog>(new InMemoryCatalog(SampleData.Products()))
    .AddSingleton<IOrderRepository>(new JsonOrderRepository(Path.Combine(Path.GetTempPath(), "tinyshop-orders")))
    .AddSingleton<IPricingRule>(new BulkDiscount(minimumItems: 5, percent: 10))
    .AddSingleton<IPricingRule>(new CouponDiscount("WELCOME", new Money(5, "EUR")))
    .AddSingleton<OrderService>();

using var provider = services.BuildServiceProvider();
var shop = provider.GetRequiredService<OrderService>();
var customer = new Customer(new CustomerId(1), "Ada", "EUR");
var order = shop.Place(customer, new Dictionary<ProductId, int> { [SampleData.Teapot] = 1, [SampleData.Cup] = 6 });
order.Redeem("WELCOME");
Receipt.Print(order, shop.Total(order));
