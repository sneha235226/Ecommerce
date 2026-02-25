const Category = require("../../models/Category");
const Subcategory = require("../../models/Subcategory");

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

module.exports = {
  getCategories,
  getCategoryById
};
