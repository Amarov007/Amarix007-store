import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import {
  SlidersHorizontal,
  ArrowUpDown,
  Search,
  FilterX,
  Bot,
  Globe,
  Smartphone,
  Coins,
  Gift
} from 'lucide-react';

interface CategoryPageProps {
  categoryId: string;
}

export const CategoryPage: React.FC<CategoryPageProps> = ({ categoryId }) => {
  const { lang, categories, products } = useStore();

  const category = categories.find(c => c.id === categoryId) || categories[0];

  const [search, setSearch] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'best_seller'>('default');

  const categoryProducts = useMemo(() => {
    return products.filter(p => p.c === categoryId);
  }, [products, categoryId]);

  const filteredProducts = useMemo(() => {
    let list = [...categoryProducts];

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.ar.toLowerCase().includes(q) ||
        p.en.toLowerCase().includes(q) ||
        (p.tg && p.tg.toLowerCase().includes(q))
      );
    }

    // Filter by options
    Object.entries(selectedFilters).forEach(([key, val]) => {
      if (val) {
        list = list.filter(p => p.tg?.includes(val) || p.sp?.includes(val));
      }
    });

    // Sort
    if (sortBy === 'price_asc') {
      list.sort((a, b) => a.p - b.p);
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => b.p - a.p);
    } else if (sortBy === 'best_seller') {
      list.sort((a, b) => (b.bs || 99) - (a.bs || 99));
    }

    return list;
  }, [categoryProducts, search, selectedFilters, sortBy]);

  const handleFilterClick = (filterLabel: string, option: string) => {
    setSelectedFilters(prev => ({
      ...prev,
      [filterLabel]: prev[filterLabel] === option ? '' : option
    }));
  };

  const clearAllFilters = () => {
    setSelectedFilters({});
    setSearch('');
    setSortBy('default');
  };

  return (
    <div className="space-y-8">
      
      {/* Category Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#1b1c26] border border-[#2c2e3d] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-[#b9ff66] uppercase tracking-wider">
            {lang === 'ar' ? 'تصنيف المنتجات' : 'PRODUCT CATEGORY'}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-[#f3f3f3] font-['Urbanist',sans-serif] mt-1">
            {lang === 'ar' ? category.ar : category.en}
          </h1>
          <p className="text-xs sm:text-sm text-[#a4a7b5] mt-1.5 max-w-2xl">
            {lang === 'ar' ? category.da : category.de}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold bg-[#12131a] px-3.5 py-2 rounded-xl border border-[#2c2e3d] text-[#b9ff66] shrink-0">
          <span>{filteredProducts.length}</span>
          <span className="text-[#a4a7b5]">{lang === 'ar' ? 'منتج متوفر' : 'Items available'}</span>
        </div>
      </div>

      {/* Filter and Sort Toolbar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Search inside category */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder={lang === 'ar' ? 'ابحث داخل هذا القسم...' : 'Search within category...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-10 bg-[#1b1c26] border border-[#2c2e3d] focus:border-[#b9ff66] focus:outline-none rounded-xl text-xs text-[#f3f3f3] placeholder-[#a4a7b5]"
            />
            <Search className={`w-4 h-4 text-[#a4a7b5] absolute top-3.5 ${lang === 'ar' ? 'right-3.5' : 'left-3.5'}`} />
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-[#a4a7b5]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'default' | 'price_asc' | 'price_desc' | 'best_seller')}
              className="h-11 px-3 bg-[#1b1c26] border border-[#2c2e3d] text-xs font-bold text-[#f3f3f3] rounded-xl focus:outline-none focus:border-[#b9ff66]"
            >
              <option value="default">{lang === 'ar' ? 'الترتيب: الافتراضي' : 'Sort: Default'}</option>
              <option value="price_asc">{lang === 'ar' ? 'السعر: من الأقل للأعلى' : 'Price: Low to High'}</option>
              <option value="price_desc">{lang === 'ar' ? 'السعر: من الأعلى للأقل' : 'Price: High to Low'}</option>
              <option value="best_seller">{lang === 'ar' ? 'الأكثر طلباً ومبيعاً' : 'Best Sellers'}</option>
            </select>
          </div>

        </div>

        {/* Dynamic Category Filter Options */}
        {category.f && category.f.length > 0 && (
          <div className="space-y-3 pt-2">
            {category.f.map((filterGroup, idx) => {
              const label = lang === 'ar' ? filterGroup.ar : filterGroup.en;
              const activeVal = selectedFilters[label];

              return (
                <div key={idx} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-[#a4a7b5] min-w-16">
                    {label}:
                  </span>
                  {filterGroup.o.map((opt) => {
                    const isSelected = activeVal === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => handleFilterClick(label, opt)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                          isSelected
                            ? 'bg-[#b9ff66] text-[#191a23] border-[#b9ff66] font-bold shadow-sm'
                            : 'bg-[#1b1c26] text-[#a4a7b5] border-[#2c2e3d] hover:text-[#f3f3f3] hover:border-[#b9ff66]/40'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Products Grid or Empty State */}
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center rounded-3xl bg-[#1b1c26]/40 border border-[#2c2e3d] p-8 space-y-4">
          <FilterX className="w-12 h-12 text-[#a4a7b5] mx-auto opacity-40" />
          <h3 className="text-base font-bold text-[#f3f3f3]">
            {lang === 'ar' ? 'لا توجد منتجات مطابقة للبحث أو الفلاتر' : 'No products match the selected filters'}
          </h3>
          <p className="text-xs text-[#a4a7b5]">
            {lang === 'ar' ? 'جرّب إزالة الفلاتر المحددة أو كتابة كلمات بحث أخرى' : 'Try resetting your filters or using different keywords'}
          </p>
          <button
            onClick={clearAllFilters}
            className="px-5 py-2.5 rounded-xl bg-[#b9ff66] text-[#191a23] font-bold text-xs hover:bg-[#cdff8f] transition-all"
          >
            {lang === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}
          </button>
        </div>
      )}

    </div>
  );
};
