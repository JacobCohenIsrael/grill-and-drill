namespace TinyShop.Catalog;

public interface IProductCatalog
{
    Product? Find(ProductId id);
    IReadOnlyList<Product> All();
    void Reserve(ProductId id, int quantity);
}
