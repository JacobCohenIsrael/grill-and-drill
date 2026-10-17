using TinyShop.Catalog;

namespace TinyShop.Storage;

public sealed class InMemoryCatalog(IEnumerable<Product> products) : IProductCatalog
{
    private readonly Dictionary<ProductId, Product> byId = products.ToDictionary(p => p.Id);

    public Product? Find(ProductId id) => byId.GetValueOrDefault(id);

    public IReadOnlyList<Product> All() => [.. byId.Values];

    public void Reserve(ProductId id, int quantity)
    {
        var product = byId[id];
        if (product.Stock < quantity) throw new InvalidOperationException($"Only {product.Stock} of {product.Name} left");
        byId[id] = product with { Stock = product.Stock - quantity };
    }
}
