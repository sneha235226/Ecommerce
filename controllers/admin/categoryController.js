const Category = require("../../models/Category");
const Subcategory = require("../../models/Subcategory");

function makeSlug(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

async function createCategory(req, res) {
  try {
    const { name, slug: providedSlug, isActive } = req.body;
    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const slug = providedSlug ? makeSlug(providedSlug) : makeSlug(name);
    const category = await Category.create({
      name: name.trim(),
      slug,
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    return res.status(201).json({ message: "Category created successfully", category });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Category slug must be unique" });
    }
    return res.status(500).json({ message: "Unable to create category", error: error.message });
  }
}

async function getCategories(req, res) {
  try {
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === "true";
    }

    const categories = await Category.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ count: categories.length, categories });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch categories", error: error.message });
  }
}

async function getCategoryById(req, res) {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    const subCategory = await Subcategory.find({ category: category._id, isActive: true }).select("name slug imageUrl");
    category._doc.subcategories = subCategory || [];
    return res.status(200).json({ category });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch category", error: error.message });
  }
}

async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const { name, slug: providedSlug } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (name !== undefined){
        category.name = name.trim();
        category.slug = makeSlug(name.trim());
    }

    await category.save();
    return res.status(200).json({ message: "Category updated successfully", category });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Category slug must be unique" });
    }
    return res.status(500).json({ message: "Unable to update category", error: error.message });
  }
}

async function toggleCategory(req, res) {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    category.isActive = !category.isActive;
    const subcategory= await Subcategory.updateMany({ category: category._id }, { isActive: category.isActive });
    await category.save();    
    return res.status(200).json({ message: "Category toggled successfully", categoryId: category._id });
  } catch (error) {
    return res.status(500).json({ message: "Unable to toggle category", error: error.message });
  }
}

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  toggleCategory
};
