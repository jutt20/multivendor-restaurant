import { db } from './db';
import { users, vendors, captains, tables, menuCategories, menuItems, menuAddons, orders, adminConfig } from '@shared/schema';
import bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';

async function seed() {
  console.log('Starting database seeding...');

  try {
    // 🧹 1. Clean existing tables
    console.log("🧹 Cleaning existing data...");

    await db.execute(`
      TRUNCATE TABLE 
        otp_verifications,
        cart_items,
        delivery_orders,
        orders,
        menu_addons,
        menu_items,
        menu_categories,
        tables,
        captains,
        vendors,
        app_users,
        admin_config,
        users
      RESTART IDENTITY CASCADE;
    `);
    
    console.log('Creating admin user...');
    const adminPassword = await bcrypt.hash('admin123', 10);
    const [adminUser] = await db.insert(users).values({
      id: 'admin_1',
      email: 'admin@quickbiteqr.com',
      password: adminPassword,
      fullName: 'Admin User',
      role: 'admin',
    }).returning();

    console.log('Admin user created:', adminUser.id);

    console.log('Creating sample vendor user...');
    const vendorPassword = await bcrypt.hash('vendor123', 10);
    const [vendorUser] = await db.insert(users).values({
      id: 'vendor_1',
      email: 'vendor@example.com',
      password: vendorPassword,
      fullName: 'John Doe',
      phoneNumber: '+1234567890',
      role: 'vendor',
    }).returning();

    console.log('Creating sample vendors...');
    const sampleVendors = [
      { restaurantName: 'The Delicious Bistro', address: '123 Main St, New York, NY 10001', description: 'Authentic Italian cuisine', cuisineType: 'Italian', phone: '+1234567890', cnic: '12345-1234567-1', latitude: '40.7128', longitude: '-74.0060' },
      { restaurantName: 'Bayview Bistro', address: '456 Market St, San Francisco, CA 94103', description: 'California cuisine', cuisineType: 'Californian', phone: '+1234567899', cnic: '98765-4321098-7', latitude: '37.7749', longitude: '-122.4194' },
      { restaurantName: 'Sunset Grill', address: '789 Sunset Blvd, Los Angeles, CA 90028', description: 'Cozy place for brunch', cuisineType: 'American', phone: '+1234567801', cnic: '11111-1111111-1', latitude: '34.0983', longitude: '-118.3267' },
      { restaurantName: 'Oceanic Eatery', address: '321 Ocean Dr, Miami, FL 33139', description: 'Seafood specialties', cuisineType: 'Seafood', phone: '+1234567802', cnic: '22222-2222222-2', latitude: '25.7907', longitude: '-80.1300' },
      { restaurantName: 'Mountain Deli', address: '12 Hill Rd, Denver, CO 80202', description: 'Fresh sandwiches and salads', cuisineType: 'Deli', phone: '+1234567803', cnic: '33333-3333333-3', latitude: '39.7392', longitude: '-104.9903' },
      { restaurantName: 'Spice Route', address: '55 Curry St, Houston, TX 77002', description: 'Exotic Indian flavors', cuisineType: 'Indian', phone: '+1234567804', cnic: '44444-4444444-4', latitude: '29.7604', longitude: '-95.3698' },
      { restaurantName: 'Sakura Sushi', address: '88 Cherry Ln, Seattle, WA 98101', description: 'Fresh sushi and ramen', cuisineType: 'Japanese', phone: '+1234567805', cnic: '55555-5555555-5', latitude: '47.6062', longitude: '-122.3321' },
      { restaurantName: 'Taco Fiesta', address: '99 Fiesta Ave, Austin, TX 78701', description: 'Tacos and burritos', cuisineType: 'Mexican', phone: '+1234567806', cnic: '66666-6666666-6', latitude: '30.2672', longitude: '-97.7431' },
      { restaurantName: 'Le Petit Cafe', address: '101 Rue St, Boston, MA 02108', description: 'French pastries and coffee', cuisineType: 'French', phone: '+1234567807', cnic: '77777-7777777-7', latitude: '42.3601', longitude: '-71.0589' },
      { restaurantName: 'Green Garden', address: '202 Plant St, Portland, OR 97205', description: 'Vegan and vegetarian dishes', cuisineType: 'Vegan', phone: '+1234567808', cnic: '88888-8888888-8', latitude: '45.5152', longitude: '-122.6784' },
      { restaurantName: 'Bella Pasta', address: '303 Roma Rd, Chicago, IL 60601', description: 'Classic Italian pasta', cuisineType: 'Italian', phone: '+1234567809', cnic: '99999-9999999-9', latitude: '41.8781', longitude: '-87.6298' },
      { restaurantName: 'Sunrise Breakfast', address: '404 Morning Ln, Phoenix, AZ 85001', description: 'Breakfast and brunch', cuisineType: 'American', phone: '+1234567810', cnic: '10101-1010101-1', latitude: '33.4484', longitude: '-112.0740' },
    ];

    const createdVendors = [];

    for (const vendorData of sampleVendors) {
      const [vendor] = await db.insert(vendors).values({
        userId: vendorUser.id,
        ...vendorData,
        documents: { businessLicense: '/uploads/sample-license.pdf', logo: '/uploads/sample-logo.png' },
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: adminUser.id,
        isDeliveryEnabled: true,
        isPickupEnabled: true,
      }).returning();
      createdVendors.push(vendor);
      console.log('Sample vendor created:', vendor.id);
    }

    const vendor = createdVendors[0]; // use first vendor for captain, tables, menu items, orders

    console.log('Sample vendor created:', vendor.id);

    console.log('Creating sample captain...');
    const hashedPassword = await bcrypt.hash('captain123', 10);
    const captainUserId = `captain_sample_${Date.now()}`;
    
    await db.insert(users).values({
      id: captainUserId,
      role: 'captain',
    });

    const [captain] = await db.insert(captains).values({
      userId: captainUserId,
      vendorId: vendor.id,
      name: 'Mike Johnson',
      username: 'captain_mike',
      password: hashedPassword,
      phone: '+1234567891',
      isActive: true,
    }).returning();

    console.log('Sample captain created:', captain.id);

    console.log('Creating sample tables...');
    const tablesToCreate = [0, 1, 2, 3, 4];
    const createdTables = [];

    for (const tableNum of tablesToCreate) {
      const qrData = `vendor:${vendor.id}:table:${tableNum}`;
      const [table] = await db.insert(tables).values({
        vendorId: vendor.id,
        tableNumber: tableNum,
        qrData,
        captainId: tableNum < 3 ? captain.id : null,
        isActive: true,
      }).returning();
      createdTables.push(table);
    }

    console.log(`Created ${createdTables.length} sample tables`);

    console.log('Creating sample menu categories...');
    const [category1] = await db.insert(menuCategories).values({
      vendorId: vendor.id,
      name: 'Appetizers',
      description: 'Start your meal with our delicious starters',
      displayOrder: 0,
      isActive: true,
    }).returning();

    const [category2] = await db.insert(menuCategories).values({
      vendorId: vendor.id,
      name: 'Main Course',
      description: 'Our signature dishes',
      displayOrder: 1,
      isActive: true,
    }).returning();

    const [category3] = await db.insert(menuCategories).values({
      vendorId: vendor.id,
      name: 'Desserts',
      description: 'Sweet endings to your meal',
      displayOrder: 2,
      isActive: true,
    }).returning();

    console.log('Sample categories created');

    console.log('Creating sample menu items...');
    const createdItems = await db.insert(menuItems).values([
      {
        categoryId: category1.id,
        vendorId: vendor.id,
        name: 'Bruschetta',
        description: 'Grilled bread with fresh tomatoes and basil',
        price: '8.99',
        tags: ['popular', 'vegetarian'],
        isAvailable: true,
        displayOrder: 0,
      },
      {
        categoryId: category1.id,
        vendorId: vendor.id,
        name: 'Mozzarella Sticks',
        description: 'Crispy fried mozzarella with marinara sauce',
        price: '7.99',
        tags: ['vegetarian'],
        isAvailable: true,
        displayOrder: 1,
      },
      {
        categoryId: category2.id,
        vendorId: vendor.id,
        name: 'Spaghetti Carbonara',
        description: 'Classic Italian pasta with bacon and cream sauce',
        price: '15.99',
        tags: ['popular', 'recommended'],
        isAvailable: true,
        displayOrder: 0,
      },
      {
        categoryId: category2.id,
        vendorId: vendor.id,
        name: 'Margherita Pizza',
        description: 'Fresh mozzarella, tomato sauce, and basil',
        price: '12.99',
        tags: ['popular', 'vegetarian'],
        isAvailable: true,
        displayOrder: 1,
      },
      {
        categoryId: category3.id,
        vendorId: vendor.id,
        name: 'Tiramisu',
        description: 'Classic Italian coffee-flavored dessert',
        price: '6.99',
        tags: ['recommended'],
        isAvailable: true,
        displayOrder: 0,
      },
    ]).returning();

    const bruschetta = createdItems.find((item) => item.name === 'Bruschetta');
    const pizza = createdItems.find((item) => item.name === 'Margherita Pizza');
    const carbonara = createdItems.find((item) => item.name === 'Spaghetti Carbonara');
    const tiramisu = createdItems.find((item) => item.name === 'Tiramisu');

    if (!bruschetta || !pizza || !carbonara || !tiramisu) {
      throw new Error('Failed to seed baseline menu items');
    }

    console.log('Creating sample menu addons...');
    await db.insert(menuAddons).values([
      {
        vendorId: vendor.id,
        itemId: pizza.id,
        name: 'Extra Cheese',
        price: '1.50',
        isRequired: false,
        category: 'Toppings',
      },
      {
        vendorId: vendor.id,
        itemId: carbonara.id,
        name: 'Garlic Bread Side',
        price: '3.50',
        isRequired: false,
        category: 'Sides',
      },
      {
        vendorId: vendor.id,
        itemId: tiramisu.id,
        name: 'Chocolate Drizzle',
        price: '0.75',
        isRequired: false,
        category: 'Extras',
      },
    ]);

    console.log('Sample menu items created');

    console.log('Creating sample order...');
    const [order] = await db.insert(orders).values({
      vendorId: vendor.id,
      tableId: createdTables[0].id,
      items: [
        {
          itemId: bruschetta.id,
          name: 'Bruschetta',
          quantity: 2,
          price: '8.99',
          subtotal: '17.98',
        },
        {
          itemId: carbonara.id,
          name: 'Spaghetti Carbonara',
          quantity: 1,
          price: '15.99',
          addons: [
            {
              name: 'Garlic Bread Side',
              price: '3.50',
              quantity: 1,
            },
          ],
          subtotal: '15.99',
        },
      ],
      totalAmount: '33.97',
      customerName: 'Jane Smith',
      customerPhone: '+1234567892',
      status: 'pending',
      customerNotes: 'Please make it spicy',
    }).returning();

    console.log('Sample order created:', order.id);

    console.log('Setting up admin configuration...');
    await db.insert(adminConfig).values([
      {
        key: 'twilio_enabled',
        value: JSON.stringify({
          accountSid: '',
          authToken: '',
          phoneNumber: '',
        }),
        isEnabled: false,
        description: 'Twilio SMS notifications for order updates and vendor approvals',
      },
      {
        key: 'firebase_enabled',
        value: JSON.stringify({
          projectId: '',
          privateKey: '',
          clientEmail: '',
        }),
        isEnabled: false,
        description: 'Firebase push notifications for mobile app users',
      },
      {
        key: 'maps_enabled',
        value: JSON.stringify({
          apiKey: '',
        }),
        isEnabled: false,
        description: 'Google Maps for vendor location and geocoding',
      },
    ]);

    console.log('Admin configuration created');

    console.log('✅ Database seeding completed successfully!');
    console.log('\nSample credentials:');
    console.log('Admin: email=admin@quickbiteqr.com, password=admin123');
    console.log('Vendor: email=vendor@example.com, password=vendor123');
    console.log('Captain: username=captain_mike, password=captain123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();
