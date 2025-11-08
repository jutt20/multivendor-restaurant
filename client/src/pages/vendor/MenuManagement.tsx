"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, UtensilsCrossed, Folder, FolderPlus, ListPlus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { MenuCategory, MenuItem, MenuSubcategory as SubMenuCategory, MenuAddon } from "@shared/schema";

type MenuItemWithAddons = MenuItem & { addons?: MenuAddon[] };

export default function MenuManagement() {
  const { toast } = useToast();

  // Dialog states
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isCreatingSubCategory, setIsCreatingSubCategory] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isManagingAddons, setIsManagingAddons] = useState(false);

  // Form states
  const [categoryName, setCategoryName] = useState("");
  const [categoryDesc, setCategoryDesc] = useState("");

  const [subCategoryName, setSubCategoryName] = useState("");
  const [subCategoryDesc, setSubCategoryDesc] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState<string>("");

  const [itemCategoryId, setItemCategoryId] = useState<string>("");
  const [itemSubCategoryId, setItemSubCategoryId] = useState<string>("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemPhoto, setItemPhoto] = useState<File | null>(null);
  const [itemAvailable, setItemAvailable] = useState(true);

  // Selected category (for auto-fill item creation)
  const [selectedCategoryForItem, setSelectedCategoryForItem] = useState<string>("");
  const [activeItemForAddons, setActiveItemForAddons] = useState<MenuItemWithAddons | null>(null);
  const [editingAddon, setEditingAddon] = useState<MenuAddon | null>(null);
  const [addonName, setAddonName] = useState("");
  const [addonPrice, setAddonPrice] = useState("");
  const [addonCategory, setAddonCategory] = useState("");
  const [addonRequired, setAddonRequired] = useState(false);

  const resetAddonForm = () => {
    setAddonName("");
    setAddonPrice("");
    setAddonCategory("");
    setAddonRequired(false);
    setEditingAddon(null);
  };

  const formatPrice = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return numeric.toFixed(2);
    }
    return typeof value === "string" && value.trim() !== "" ? value : "0.00";
  };

  const openManageAddons = (item: MenuItemWithAddons) => {
    setActiveItemForAddons(item);
    resetAddonForm();
    setIsManagingAddons(true);
  };

  // Queries
  const { data: categories, isLoading: loadingCategories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/vendor/menu/categories"],
  });

  const { data: subCategories, isLoading: loadingSubCats } = useQuery<SubMenuCategory[]>({
    queryKey: ["/api/vendor/menu/subcategories"],
  });

  const { data: items, isLoading: loadingItems } = useQuery<MenuItemWithAddons[]>({
    queryKey: ["/api/vendor/menu/items"],
  });

  const { data: addons, isLoading: loadingAddons } = useQuery<MenuAddon[]>({
    queryKey: ["/api/vendor/menu/addons"],
  });

  const addonsByItem = (addons ?? []).reduce<Record<number, MenuAddon[]>>((acc, addon) => {
    if (!acc[addon.itemId]) {
      acc[addon.itemId] = [];
    }
    acc[addon.itemId].push(addon);
    return acc;
  }, {});

  useEffect(() => {
    if (!activeItemForAddons || !items) return;
    const fresh = items.find((item) => item.id === activeItemForAddons.id);
    if (fresh && fresh !== activeItemForAddons) {
      setActiveItemForAddons(fresh);
    }
  }, [items, activeItemForAddons?.id]);

  const selectedAddons =
    activeItemForAddons
      ? addonsByItem[activeItemForAddons.id] ??
        activeItemForAddons.addons ??
        []
      : [];

  // Category mutation
  const createCategory = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/vendor/menu/categories", {
        name: categoryName,
        description: categoryDesc,
      });
    },
    onSuccess: () => {
      toast({ title: "Category created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/categories"] });
      setCategoryName("");
      setCategoryDesc("");
      setIsCreatingCategory(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create category",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Subcategory mutation
  const createSubCategory = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/vendor/menu/subcategories", {
        categoryId: Number(parentCategoryId),
        name: subCategoryName,
        description: subCategoryDesc,
      });
    },
    onSuccess: () => {
      toast({ title: "Subcategory created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/subcategories"] });
      setSubCategoryName("");
      setSubCategoryDesc("");
      setParentCategoryId("");
      setIsCreatingSubCategory(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create subcategory",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Item mutation (multipart)
  const createItem = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("categoryId", String(Number(itemCategoryId)));
      if (itemSubCategoryId) formData.append("subCategoryId", itemSubCategoryId);
      formData.append("name", itemName);
      formData.append("price", itemPrice);
      formData.append("description", itemDescription);
      formData.append("isAvailable", itemAvailable ? "true" : "false");
      if (itemPhoto) formData.append("photo", itemPhoto);

      const res = await fetch("/api/vendor/menu/items", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create item");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Item added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      setItemName("");
      setItemPrice("");
      setItemDescription("");
      setItemPhoto(null);
      setItemAvailable(true);
      setItemCategoryId("");
      setItemSubCategoryId("");
      setIsCreatingItem(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add item",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const saveAddon = useMutation({
    mutationFn: async () => {
      if (!activeItemForAddons) {
        throw new Error("Select a menu item first");
      }

      const trimmedName = addonName.trim();
      const trimmedPrice = addonPrice.trim();
      const trimmedCategory = addonCategory.trim();

      const payload = {
        itemId: activeItemForAddons.id,
        name: trimmedName,
        price: trimmedPrice === "" ? "0" : trimmedPrice,
        category: trimmedCategory === "" ? undefined : trimmedCategory,
        isRequired: addonRequired,
      };

      if (editingAddon) {
        const res = await apiRequest("PUT", `/api/vendor/menu/addons/${editingAddon.id}`, payload);
        return res.json();
      }

      const res = await apiRequest("POST", "/api/vendor/menu/addons", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingAddon ? "Addon updated" : "Addon added", description: editingAddon ? undefined : "Customers will now see this addon when ordering." });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/addons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      resetAddonForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save addon",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const toggleAddonRequired = useMutation({
    mutationFn: async ({ addonId, isRequired }: { addonId: number; isRequired: boolean }) => {
      const res = await apiRequest("PUT", `/api/vendor/menu/addons/${addonId}`, { isRequired });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/addons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update addon",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteAddon = useMutation({
    mutationFn: async (addonId: number) => {
      const res = await apiRequest("DELETE", `/api/vendor/menu/addons/${addonId}`);
      return res.json();
    },
    onSuccess: (_data, addonId) => {
      toast({ title: "Addon removed" });
      if (editingAddon?.id === addonId) {
        resetAddonForm();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/addons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete addon",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleEditAddon = (addon: MenuAddon) => {
    setEditingAddon(addon);
    setAddonName(addon.name ?? "");
    setAddonPrice(addon.price?.toString() ?? "");
    setAddonCategory(addon.category ?? "");
    setAddonRequired(Boolean(addon.isRequired));
  };

  const handleToggleAddonRequired = (addon: MenuAddon, next: boolean) => {
    toggleAddonRequired.mutate({ addonId: addon.id, isRequired: next });
  };

  const handleDeleteAddon = (addonId: number) => {
    deleteAddon.mutate(addonId);
  };

  const handleSaveAddon = () => {
    if (!addonName.trim()) {
      toast({
        title: "Addon name is required",
        variant: "destructive",
      });
      return;
    }
    saveAddon.mutate();
  };

  const handleAddonsDialogChange = (open: boolean) => {
    if (!open) {
      setIsManagingAddons(false);
      setActiveItemForAddons(null);
      resetAddonForm();
    } else {
      setIsManagingAddons(true);
    }
  };

  const isAddonFormValid = addonName.trim().length > 0;

  const renderMenuItemCard = (item: MenuItemWithAddons) => {
    const itemAddons = addonsByItem[item.id] ?? item.addons ?? [];

    return (
      <Card key={item.id} className="hover-elevate">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start gap-4">
            <div>
              <CardTitle className="text-base">{item.name}</CardTitle>
              <span className="text-sm font-mono text-muted-foreground">${formatPrice(item.price)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => openManageAddons(item)}
            >
              <ListPlus className="h-4 w-4 mr-1" />
              Manage
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
              <span>Add-ons</span>
              {loadingAddons && <Skeleton className="h-4 w-12" />}
            </div>
            {loadingAddons ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : itemAddons.length > 0 ? (
              <div className="space-y-2">
                {itemAddons.map((addon) => (
                  <div
                    key={addon.id}
                    className="flex items-center justify-between rounded-md border border-muted p-2"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{addon.name}</span>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {addon.isRequired && <Badge variant="secondary">Required</Badge>}
                        {addon.category && <Badge variant="outline">{addon.category}</Badge>}
                      </div>
                    </div>
                    <span className="text-xs font-mono">${formatPrice(addon.price)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No add-ons yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Handle "Add Item" click for a specific category
  const handleOpenAddItem = (categoryId: number) => {
    setSelectedCategoryForItem(categoryId.toString());
    setItemCategoryId(categoryId.toString());
    setIsCreatingItem(true);
  };

  // Group subcategories by category
  const subCatsByCategory = subCategories?.reduce((acc, sub) => {
    (acc[sub.categoryId] = acc[sub.categoryId] || []).push(sub);
    return acc;
  }, {} as Record<number, SubMenuCategory[]>) || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Menu Management</h1>
          <p className="text-muted-foreground mt-2">
            Organize your menu with categories, subcategories, and items
          </p>
        </div>

        <div className="flex gap-2">
          {/* Add Category */}
          <Dialog open={isCreatingCategory} onOpenChange={setIsCreatingCategory}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Folder className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Category</DialogTitle>
                <DialogDescription>
                  Organize your menu items into top-level categories
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Label>Name</Label>
                <Input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Appetizers"
                />
                <Label>Description (Optional)</Label>
                <Textarea
                  value={categoryDesc}
                  onChange={(e) => setCategoryDesc(e.target.value)}
                  placeholder="Short description"
                />
                <Button
                  className="w-full"
                  onClick={() => createCategory.mutate()}
                  disabled={createCategory.isPending || !categoryName.trim()}
                >
                  {createCategory.isPending ? "Creating..." : "Create Category"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

      {/* Manage Add-ons Dialog */}
      <Dialog open={isManagingAddons} onOpenChange={handleAddonsDialogChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {activeItemForAddons
                ? `Manage add-ons for ${activeItemForAddons.name}`
                : "Manage add-ons"}
            </DialogTitle>
            <DialogDescription>
              Create extras like sauces, sides, or upgrades to attach to menu items.
            </DialogDescription>
          </DialogHeader>

          {activeItemForAddons ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Current add-ons</h4>
                {loadingAddons ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-5/6" />
                  </div>
                ) : selectedAddons.length > 0 ? (
                  <div className="space-y-2">
                    {selectedAddons.map((addon) => (
                      <div
                        key={addon.id}
                        className="flex flex-col gap-3 rounded-md border border-muted p-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="font-medium">{addon.name}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>${formatPrice(addon.price)}</span>
                            {addon.category && <Badge variant="outline">{addon.category}</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 md:justify-end">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Required</span>
                            <Switch
                              checked={Boolean(addon.isRequired)}
                              onCheckedChange={(checked) => handleToggleAddonRequired(addon, checked)}
                              disabled={toggleAddonRequired.isPending}
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditAddon(addon)}
                            disabled={saveAddon.isPending}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteAddon(addon.id)}
                            disabled={deleteAddon.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No add-ons yet. Create your first add-on below.
                  </p>
                )}
              </div>

              <div className="space-y-4 border-t border-muted pt-4">
                <h4 className="text-sm font-semibold">
                  {editingAddon ? "Edit add-on" : "Add a new add-on"}
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={addonName}
                      onChange={(e) => setAddonName(e.target.value)}
                      placeholder="e.g. Extra cheese"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price (₹)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={addonPrice}
                      onChange={(e) => setAddonPrice(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category (optional)</Label>
                    <Input
                      value={addonCategory}
                      onChange={(e) => setAddonCategory(e.target.value)}
                      placeholder="e.g. Sauces"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
                    <div>
                      <Label className="font-medium">Required add-on</Label>
                      <p className="text-xs text-muted-foreground">
                        Customers must select this add-on when ordering the item.
                      </p>
                    </div>
                    <Switch checked={addonRequired} onCheckedChange={setAddonRequired} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSaveAddon}
                    disabled={!isAddonFormValid || saveAddon.isPending}
                  >
                    {saveAddon.isPending
                      ? "Saving..."
                      : editingAddon
                      ? "Save changes"
                      : "Add add-on"}
                  </Button>
                  {editingAddon && (
                    <Button
                      variant="ghost"
                      onClick={resetAddonForm}
                      disabled={saveAddon.isPending}
                    >
                      Cancel edit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a menu item to manage its add-ons.
            </p>
          )}
        </DialogContent>
      </Dialog>
          {/* Add Subcategory */}
          <Dialog open={isCreatingSubCategory} onOpenChange={setIsCreatingSubCategory}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <FolderPlus className="h-4 w-4 mr-2" />
                Add Subcategory
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Subcategory</DialogTitle>
                <DialogDescription>
                  Group similar items under a parent category
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Label>Parent Category</Label>
                <Select value={parentCategoryId} onValueChange={setParentCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label>Subcategory Name</Label>
                <Input
                  value={subCategoryName}
                  onChange={(e) => setSubCategoryName(e.target.value)}
                  placeholder="e.g. Veg Pizza"
                />
                <Label>Description (Optional)</Label>
                <Textarea
                  value={subCategoryDesc}
                  onChange={(e) => setSubCategoryDesc(e.target.value)}
                  placeholder="Short description"
                />
                <Button
                  className="w-full"
                  onClick={() => createSubCategory.mutate()}
                  disabled={
                    createSubCategory.isPending ||
                    !subCategoryName.trim() ||
                    !parentCategoryId
                  }
                >
                  {createSubCategory.isPending
                    ? "Creating..."
                    : "Create Subcategory"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Display */}
      {loadingCategories || loadingSubCats || loadingItems ? (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="space-y-6">
          {categories.map((category) => (
            <Card key={category.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{category.name}</CardTitle>
                    {category.description && (
                      <CardDescription>{category.description}</CardDescription>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenAddItem(category.id)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Subcategories under category */}
                {subCatsByCategory[category.id]?.map((sub) => (
                  <div key={sub.id} className="mb-6">
                    <h3 className="font-semibold mb-2">{sub.name}</h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {items
                        ?.filter((i) => i.subCategoryId === sub.id)
                        .map((item) => renderMenuItemCard(item))}
                      {!items?.some((i) => i.subCategoryId === sub.id) && (
                        <div className="col-span-full text-center py-6 text-sm text-muted-foreground">
                          No items in this subcategory yet
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Items without subcategory */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items
                    ?.filter(
                      (i) => i.categoryId === category.id && !i.subCategoryId
                    )
                    .map((item) => renderMenuItemCard(item))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <UtensilsCrossed className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No menu yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Start by creating categories and subcategories
            </p>
            <Button onClick={() => setIsCreatingCategory(true)}>
              <Folder className="h-4 w-4 mr-2" />
              Create First Category
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add Item Dialog */}
      <Dialog open={isCreatingItem} onOpenChange={setIsCreatingItem}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Menu Item</DialogTitle>
            <DialogDescription>Create a new item for your menu</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Label>Category</Label>
            <Select value={itemCategoryId} onValueChange={setItemCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {itemCategoryId && (
              <>
                <Label>Subcategory (optional)</Label>
                <Select
                  value={itemSubCategoryId}
                  onValueChange={setItemSubCategoryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    {subCatsByCategory[Number(itemCategoryId)]?.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id.toString()}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            <Label>Item Name</Label>
            <Input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Margherita Pizza"
            />

            <Label>Price (₹)</Label>
            <Input
              type="number"
              step="0.01"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
            />

            <Label>Description</Label>
            <Textarea
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              placeholder="Describe this dish..."
            />

            <Label>Photo</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setItemPhoto(e.target.files?.[0] || null)}
            />

            <div className="flex items-center justify-between">
              <Label>Available</Label>
              <Switch checked={itemAvailable} onCheckedChange={setItemAvailable} />
            </div>

            <Button
              className="w-full"
              onClick={() => createItem.mutate()}
              disabled={
                createItem.isPending ||
                !itemName.trim() ||
                !itemCategoryId ||
                !itemPrice.trim()
              }
            >
              {createItem.isPending ? "Adding..." : "Add Item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
