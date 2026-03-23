
export const mockServiceCategories = [
  {
    CategoryId: 'SCAT001',
    Name: 'Basic Nail Care',
    Description: 'Essential nail care services including manicure, pedicure, and repairs'
  },
  {
    CategoryId: 'SCAT002',
    Name: 'Advanced Nail Services',
    Description: 'Professional gel, acrylic, and nail extension services'
  },
  {
    CategoryId: 'SCAT003',
    Name: 'Nail Art & Design',
    Description: 'Creative nail art designs and French manicure styles'
  },
  {
    CategoryId: 'SCAT004',
    Name: 'Spa & Treatments',
    Description: 'Luxurious spa packages and specialized treatments'
  }
];

export const mockProductCategories = [
  {
    CategoryId: 'PCAT001',
    Name: 'Nail Polish & Colors',
    Description: 'Wide range of nail polish colors and gel polish collections'
  },
  {
    CategoryId: 'PCAT002',
    Name: 'Nail Care & Treatment',
    Description: 'Cuticle oils, base coats, top coats, and strengthening treatments'
  },
  {
    CategoryId: 'PCAT003',
    Name: 'Tools & Accessories',
    Description: 'Professional nail files, nail art kits, and accessories'
  },
  {
    CategoryId: 'PCAT004',
    Name: 'Bundles & Sets',
    Description: 'Complete nail care bundles and gift sets'
  }
];

export const mockHomePageFeatures = [
  {
    id: 1,
    title: 'Quality Guaranteed',
    description: 'Carefully selected from leading beauty brands',
    iconKey: 'shield'
  },
  {
    id: 2,
    title: 'Professional Consultation',
    description: 'Expert team with product knowledge, 24/7 customer support',
    iconKey: 'headset'
  },
  {
    id: 3,
    title: 'Diverse Payment',
    description: 'Absolute security, COD support, online payment',
    iconKey: 'card'
  },
  {
    id: 4,
    title: 'Flexible Returns',
    description: 'Easy return support within 7 days',
    iconKey: 'sync'
  }
];

export const mockCatMessages = [
  {
    id: 'chat-001',
    sender: 'shop',
    text: 'Hi there 👋 Welcome to NIOM&CE. How can we help you today?',
    time: '09:12'
  },
  {
    id: 'chat-002',
    sender: 'user',
    text: 'I want to book a gel nails service this weekend.',
    time: '09:13'
  },
  {
    id: 'chat-003',
    sender: 'shop',
    text: 'Great choice! Please share your preferred date and time.',
    time: '09:13'
  }
];

export const mockServices = [
  {
    ServiceId: 'SV001',
    Name: 'Manicure',
    Description: 'Professional nail care and polish application with hand massage',
    Price: 35.00,
    DurationMinutes: 45,
    ImageUrl: '/OurServices/Manicure.jpg',
    Status: 'Active',
    CategoryId: 'SCAT001'
  },
  {
    ServiceId: 'SV002',
    Name: 'Pedicure',
    Description: 'Relaxing foot spa treatment with nail care and polish',
    Price: 45.00,
    DurationMinutes: 60,
    ImageUrl: '/OurServices/Pedicure.jpg',
    Status: 'Active',
    CategoryId: 'SCAT001'
  },
  {
    ServiceId: 'SV003',
    Name: 'Gel Nails',
    Description: 'Long-lasting gel polish application with UV curing',
    Price: 55.00,
    DurationMinutes: 75,
    ImageUrl: '/OurServices/GelNails.jpg',
    Status: 'Active',
    CategoryId: 'SCAT002'
  },
  {
    ServiceId: 'SV004',
    Name: 'Nail Art',
    Description: 'Custom nail designs and decorations by professional artists',
    Price: 65.00,
    DurationMinutes: 90,
    ImageUrl: '/OurServices/NailArt.jpg',
    Status: 'Active',
    CategoryId: 'SCAT003'
  },
  {
    ServiceId: 'SV005',
    Name: 'Acrylic Nails',
    Description: 'Full set acrylic nail extensions with shaping and polish',
    Price: 75.00,
    DurationMinutes: 120,
    ImageUrl: '/OurServices/AcrylicNails.jpg',
    Status: 'Active',
    CategoryId: 'SCAT002'
  },
  {
    ServiceId: 'SV006',
    Name: 'Spa Package',
    Description: 'Complete spa experience including manicure, pedicure and massage',
    Price: 120.00,
    DurationMinutes: 150,
    ImageUrl: '/OurServices/SpaPackage.jpg',
    Status: 'Active',
    CategoryId: 'SCAT004'
  },
  {
    ServiceId: 'SV007',
    Name: 'French Manicure',
    Description: 'Classic French tips with natural pink base and elegant white tips',
    Price: 40.00,
    DurationMinutes: 50,
    ImageUrl: '/OurServices/FrenchManicure.jpg',
    Status: 'Active',
    CategoryId: 'SCAT003'
  },
  {
    ServiceId: 'SV008',
    Name: 'Nail Extension',
    Description: 'Professional nail extensions for added length and strength',
    Price: 85.00,
    DurationMinutes: 120,
    ImageUrl: '/OurServices/NailExtension.jpg',
    Status: 'Active',
    CategoryId: 'SCAT002'
  },
  {
    ServiceId: 'SV009',
    Name: 'Paraffin Treatment',
    Description: 'Moisturizing paraffin wax treatment for soft hands and feet',
    Price: 30.00,
    DurationMinutes: 30,
    ImageUrl: '/OurServices/ParaffinTreatment.jpg',
    Status: 'Active',
    CategoryId: 'SCAT004'
  },
  {
    ServiceId: 'SV010',
    Name: 'Nail Repair',
    Description: 'Expert repair service for damaged, broken or weak nails',
    Price: 25.00,
    DurationMinutes: 30,
    ImageUrl: '/OurServices/NailRepair.jpg',
    Status: 'Active',
    CategoryId: 'SCAT001'
  }
];

export const mockProducts = [
  {
    ProductId: 'PRD001',
    Name: 'Luxury Nail Polish - Blue Jelly',
    Price: 15.00,
    Description: 'NET RED TRANSLUCENT NAIL POLISH GLUE - Moisturizing skin jelly beauty - Miss Monday #022',
    ImageUrl: '/Products/1.jpg',
    Stock: 150,
    Status: 'Active',
    CategoryId: 'PCAT001'
  },
  {
    ProductId: 'PRD002',
    Name: 'Cuticle Oil Premium',
    Price: 12.00,
    Description: 'Nourishing cuticle treatment with vitamin E and jojoba oil for healthy nails',
    ImageUrl: '/Products/2.jpg',
    Stock: 80,
    Status: 'Active',
    CategoryId: 'PCAT002'
  },
  {
    ProductId: 'PRD003',
    Name: 'Professional Nail Art Kit',
    Price: 45.00,
    Description: 'Complete nail art accessories and tools set with brushes, rhinestones, and stickers',
    ImageUrl: '/Products/3.jpg',
    Stock: 35,
    Status: 'Active',
    CategoryId: 'PCAT003'
  },
  {
    ProductId: 'PRD004',
    Name: 'Luxury Hand Cream',
    Price: 18.00,
    Description: 'Moisturizing hand treatment with shea butter and collagen for soft smooth skin',
    ImageUrl: '/Products/4.jpg',
    Stock: 0,
    Status: 'OutOfStock',
    CategoryId: 'PCAT002'
  },
  {
    ProductId: 'PRD005',
    Name: 'Gel Polish Set - XEIJAYI',
    Price: 65.00,
    Description: 'Professional gel polish collection with top and base coat - 15ML UV Gel Polish',
    ImageUrl: '/Products/5.jpg',
    Stock: 45,
    Status: 'Active',
    CategoryId: 'PCAT001'
  },
  {
    ProductId: 'PRD006',
    Name: 'Professional Nail File Set',
    Price: 25.00,
    Description: 'Professional quality nail files and buffers in multiple grits for perfect nails',
    ImageUrl: '/Products/6.jpg',
    Stock: 60,
    Status: 'Active',
    CategoryId: 'PCAT003'
  },
  {
    ProductId: 'PRD007',
    Name: 'Strengthening Base Coat',
    Price: 14.00,
    Description: 'Strengthening base coat for healthy nails with calcium and keratin',
    ImageUrl: '/Products/7.jpg',
    Stock: 55,
    Status: 'Active',
    CategoryId: 'PCAT002'
  },
  {
    ProductId: 'PRD008',
    Name: 'Diamond Top Coat',
    Price: 16.00,
    Description: 'High-gloss diamond top coat for long-lasting shine and chip resistance',
    ImageUrl: '/Products/8.jpg',
    Stock: 70,
    Status: 'Active',
    CategoryId: 'PCAT002'
  },
  {
    ProductId: 'PRD009',
    Name: 'Nail Polish Remover - Acetone Free',
    Price: 10.00,
    Description: 'Gentle acetone-free nail polish remover with moisturizing aloe vera',
    ImageUrl: '/Products/9.jpg',
    Stock: 90,
    Status: 'Active',
    CategoryId: 'PCAT002'
  },
  {
    ProductId: 'PRD010',
    Name: 'Nail Care Essential Bundle',
    Price: 89.00,
    Description: 'Complete nail care bundle with polish, base coat, top coat, cuticle oil and tools',
    ImageUrl: '/Products/10.jpg',
    Stock: 25,
    Status: 'Active',
    CategoryId: 'PCAT004'
  }
];

export const mockProductVariants = [
  { VariantId: 'VAR001', ProductId: 'PRD001', VariantName: 'Blue Jelly', Stock: 50 },
  { VariantId: 'VAR002', ProductId: 'PRD001', VariantName: 'Pink Dream', Stock: 40 },
  { VariantId: 'VAR003', ProductId: 'PRD001', VariantName: 'Purple Haze', Stock: 35 },
  { VariantId: 'VAR004', ProductId: 'PRD001', VariantName: 'Golden Shimmer', Stock: 25 },
  
  { VariantId: 'VAR005', ProductId: 'PRD002', VariantName: 'Lavender Scent', Stock: 40 },
  { VariantId: 'VAR006', ProductId: 'PRD002', VariantName: 'Rose Scent', Stock: 40 },
  
  { VariantId: 'VAR007', ProductId: 'PRD004', VariantName: 'Vanilla', Stock: 0 },
  { VariantId: 'VAR008', ProductId: 'PRD004', VariantName: 'Coconut', Stock: 0 },
  { VariantId: 'VAR009', ProductId: 'PRD004', VariantName: 'Cerry Blossom', Stock: 0 },
  
  { VariantId: 'VAR010', ProductId: 'PRD005', VariantName: 'Classic Colors (6pc)', Stock: 20 },
  { VariantId: 'VAR011', ProductId: 'PRD005', VariantName: 'Pastel Colors (6pc)', Stock: 15 },
  { VariantId: 'VAR012', ProductId: 'PRD005', VariantName: 'Bold Colors (6pc)', Stock: 10 },
  
  { VariantId: 'VAR013', ProductId: 'PRD006', VariantName: 'Standard Set (5pc)', Stock: 35 },
  { VariantId: 'VAR014', ProductId: 'PRD006', VariantName: 'Professional Set (10pc)', Stock: 25 },
  
  { VariantId: 'VAR015', ProductId: 'PRD010', VariantName: 'Beginner Kit', Stock: 15 },
  { VariantId: 'VAR016', ProductId: 'PRD010', VariantName: 'Professional Kit', Stock: 10 }
];

export const productCategories = [
  'All Products',
  'Nail Polish',
  'Nail Care',
  'Tools & Accessories'
];

export const serviceStatuses = [
  'Active',
  'Inactive',
  'ComingSoon'
];

export const productStatuses = [
  'Active',
  'OutOfStock',
  'Discontinued'
];

export const bookingStatuses = [
  'C',
  'Confirmed',
  'Completed',
  'Cancelled'
];

export const orderStatuses = [
  'C',
  'Processing',
  'Shipped',
  'Delivered',
  'Cancelled'
];

export const mockReviews = [
  {
    ReviewId: 'REV001',
    UserId: 'USR001',
    CustomerName: 'Sarah Johnson',
    Rating: 5,
    Comment: 'Absolutely amazing service! The nail technicians are highly skilled and the atmosphere is so relaxing. My gel manicure lasted 3 weeks without chipping!',
    ServiceName: 'Gel Nails',
    CreatedAt: '2026-02-15',
    Avatar: '/Profiles/1.jpg'
  },
  {
    ReviewId: 'REV002',
    UserId: 'USR002',
    CustomerName: 'Emily Cen',
    Rating: 5,
    Comment: 'Best nail salon in town! The nail art designs are creative and unique. The staff is friendly and professional. Highly recommend!',
    ServiceName: 'Nail Art',
    CreatedAt: '2026-02-20',
    Avatar: '/Profiles/2.jpg'
  },
  {
    ReviewId: 'REV003',
    UserId: 'USR003',
    CustomerName: 'Jessica Martinez',
    Rating: 5,
    Comment: 'I love coming here! Clean, professional, and they always do an excellent job. The pedicure is heavenly and my nails always look perfect.',
    ServiceName: 'Pedicure',
    CreatedAt: '2026-02-25',
    Avatar: '/Profiles/3.jpg'
  },
  {
    ReviewId: 'REV004',
    UserId: 'USR004',
    CustomerName: 'Amanda Wilson',
    Rating: 4,
    Comment: 'Great experience overall! The technicians are talented and pay attention to detail. The only reason for 4 stars is the wait time, but it\'s worth it!',
    ServiceName: 'Acrylic Nails',
    CreatedAt: '2026-03-01',
    Avatar: '/Profiles/4.jpg'
  },
  {
    ReviewId: 'REV005',
    UserId: 'USR005',
    CustomerName: 'Lisa Thompson',
    Rating: 5,
    Comment: 'Exceptional quality and service! My manicure always looks salon-perfect for weeks. The products they use are top-notch. Will definitely come back!',
    ServiceName: 'Manicure',
    CreatedAt: '2026-03-05',
    Avatar: '/Profiles/5.jpg'
  },
  {
    ReviewId: 'REV006',
    UserId: 'USR006',
    CustomerName: 'Michelle Davis',
    Rating: 5,
    Comment: 'Fantastic! The attention to hygiene and cleanliness is impressive. The staff makes you feel welcome and comfortable. Best salon experience ever!',
    ServiceName: 'Gel Nails',
    CreatedAt: '2026-03-08',
    Avatar: '/Profiles/6.jpg'
  },
  {
    ReviewId: 'REV007',
    UserId: 'USR007',
    CustomerName: 'Rachel Green',
    Rating: 5,
    Comment: 'Outstanding service from start to finish! The nail extension work is flawless and natural-looking. I get compliments everywhere I go. Worth every penny!',
    ServiceName: 'Nail Extension',
    CreatedAt: '2026-03-09',
    Avatar: '/Profiles/7.jpg'
  },
  {
    ReviewId: 'REV008',
    UserId: 'USR008',
    CustomerName: 'Monica Geller',
    Rating: 5,
    Comment: 'Impeccable attention to detail! The spa package was pure luxury - from the hand massage to the paraffin treatment. My hands have never felt better!',
    ServiceName: 'Spa Package',
    CreatedAt: '2026-03-10',
    Avatar: '/Profiles/8.jpg'
  },
  {
    ReviewId: 'REV009',
    UserId: 'USR009',
    CustomerName: 'Phoebe Buffay',
    Rating: 4,
    Comment: 'Really lovely experience! The French manicure looks elegant and sophisticated. Minor wait time but the quality makes up for it. Will return!',
    ServiceName: 'French Manicure',
    CreatedAt: '2026-03-10',
    Avatar: '/Profiles/9.jpg'
  },
  {
    ReviewId: 'REV010',
    UserId: 'USR010',
    CustomerName: 'Jennifer Anderson',
    Rating: 5,
    Comment: 'Exceeded all expectations! The technician fixed my damaged nails beautifully. Professional, caring service in a luxurious environment. My new favorite spot!',
    ServiceName: 'Nail Repair',
    CreatedAt: '2026-03-11',
    Avatar: '/Profiles/10.jpg'
  },
  {
    ReviewId: 'REV011',
    UserId: 'USR011',
    CustomerName: 'Sophia Taylor',
    Rating: 5,
    Comment: 'Absolutely love this salon! The paraffin treatment is so soothing and moisturizing. My hands feel like silk. Fabulous service every single time!',
    ServiceName: 'Paraffin Treatment',
    CreatedAt: '2026-03-11',
    Avatar: '/Profiles/11.jpg'
  }
];

export const salonStats = {
  TotalOrders: 1250,
  TotalBookings: 3480,
  AverageRating: 4.9,
  HappyCustomers: 2100
};

export const mockUsers = [
  {
    UserId: 'USR001',
    Name: 'Sarah Johnson',
    Email: 'sarah.johnson@email.com',
    Phone: '+1-555-0101',
    Status: 'Active',
    CreatedAt: '2025-01-15T10:00:00Z'
  },
  {
    UserId: 'USR002',
    Name: 'Emily Cen',
    Email: 'emily.chen@email.com',
    Phone: '+1-555-0102',
    Status: 'Active',
    CreatedAt: '2025-02-20T10:00:00Z'
  },
  {
    UserId: 'USR003',
    Name: 'Jessica Martinez',
    Email: 'jessica.martinez@email.com',
    Phone: '+1-555-0103',
    Status: 'Active',
    CreatedAt: '2025-03-10T10:00:00Z'
  }
];

export const mockAddresses = [
  {
    AddressId: 'ADDR001',
    UserId: 'USR001',
    FullName: 'Sarah Johnson',
    PhoneNumber: '+1-555-0101',
    AddressLine: '123 Main Street, Apt 4B',
    City: 'New York',
    Country: 'United States',
    IsDefault: true
  },
  {
    AddressId: 'ADDR002',
    UserId: 'USR002',
    FullName: 'Emily Cen',
    PhoneNumber: '+1-555-0102',
    AddressLine: '456 Oak Avenue',
    City: 'Los Angeles',
    Country: 'United States',
    IsDefault: true
  },
  {
    AddressId: 'ADDR003',
    UserId: 'USR003',
    FullName: 'Jessica Martinez',
    PhoneNumber: '+1-555-0103',
    AddressLine: '789 Pine Road',
    City: 'Cicago',
    Country: 'United States',
    IsDefault: true
  }
];

export const mockProfileAddresses = [
  {
    id: 1,
    label: 'Home',
    fullName: 'Sarah Johnson',
    phone: '+1 555-0101',
    address: '123 Main Street',
    ward: 'Ward 1',
    district: 'District 1',
    city: 'Ho Ci Minh City',
    isDefault: true
  },
  {
    id: 2,
    label: 'Office',
    fullName: 'Sarah Johnson',
    phone: '+1 555-0102',
    address: '456 Business Ave',
    ward: 'Ward 3',
    district: 'District 3',
    city: 'Ho Ci Minh City',
    isDefault: false
  }
];

export const getMockProductSoldCount = (productId) => {
  if (!productId) {
    return 0;
  }

  return 100 + (productId.charCodeAt(productId.length - 1) * 50);
};

export const getMockServiceBookingsCount = (serviceId) => {
  if (!serviceId) {
    return 0;
  }

  return 50 + (serviceId.charCodeAt(serviceId.length - 1) * 30);
};

export const createMockProductReview = ({ productId, rating, comment }) => ({
  ReviewId: `PREV${Date.now()}`,
  ProductId: productId,
  CustomerName: 'You',
  Rating: rating,
  Comment: comment,
  CreatedAt: new Date().toISOString().split('T')[0],
  Avatar: '/Profiles/5.jpg'
});

export const createMockServiceReview = ({ serviceId, rating, comment }) => ({
  ReviewId: `SREV${Date.now()}`,
  ServiceId: serviceId,
  CustomerName: 'You',
  Rating: rating,
  Comment: comment,
  CreatedAt: new Date().toISOString().split('T')[0],
  Avatar: '/Profiles/5.jpg'
});

export const mockOrders = [
  {
    OrderId: 'ORD001',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Delivered',
    CreatedAt: '2026-03-01T14:30:00Z'
  },
  {
    OrderId: 'ORD002',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Delivered',
    CreatedAt: '2026-02-25T10:15:00Z'
  },
  {
    OrderId: 'ORD003',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Delivered',
    CreatedAt: '2026-02-18T16:45:00Z'
  },
  {
    OrderId: 'ORD004',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Processing',
    CreatedAt: '2026-03-10T09:20:00Z'
  },
  {
    OrderId: 'ORD005',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Shipped',
    CreatedAt: '2026-03-08T13:00:00Z'
  },
  {
    OrderId: 'ORD006',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Delivered',
    CreatedAt: '2026-02-10T11:30:00Z'
  },
  {
    OrderId: 'ORD007',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Delivered',
    CreatedAt: '2026-01-28T15:45:00Z'
  },
  {
    OrderId: 'ORD008',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Delivered',
    CreatedAt: '2026-01-15T10:00:00Z'
  },
  {
    OrderId: 'ORD009',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Processing',
    CreatedAt: '2026-03-11T14:20:00Z'
  },
  {
    OrderId: 'ORD010',
    UserId: 'USR001',
    AddressId: 'ADDR001',
    Status: 'Delivered',
    CreatedAt: '2026-01-05T12:00:00Z'
  },
  {
    OrderId: 'ORD011',
    UserId: 'USR002',
    AddressId: 'ADDR002',
    Status: 'Shipped',
    CreatedAt: '2026-03-05T10:15:00Z'
  },
  {
    OrderId: 'ORD012',
    UserId: 'USR003',
    AddressId: 'ADDR003',
    Status: 'Processing',
    CreatedAt: '2026-03-10T16:45:00Z'
  }
];

export const mockOrderItems = [
  {
    OrderItemId: 'OI001',
    OrderId: 'ORD001',
    ProductId: 'PRD001',
    VariantId: 'VAR001',
    Quantity: 2,
    Price: 15.00
  },
  {
    OrderItemId: 'OI002',
    OrderId: 'ORD001',
    ProductId: 'PRD002',
    VariantId: 'VAR005',
    Quantity: 1,
    Price: 12.00
  },
  {
    OrderItemId: 'OI003',
    OrderId: 'ORD001',
    ProductId: 'PRD007',
    VariantId: null,
    Quantity: 1,
    Price: 14.00
  },
  
  {
    OrderItemId: 'OI004',
    OrderId: 'ORD002',
    ProductId: 'PRD005',
    VariantId: 'VAR010',
    Quantity: 1,
    Price: 65.00
  },
  {
    OrderItemId: 'OI005',
    OrderId: 'ORD002',
    ProductId: 'PRD008',
    VariantId: null,
    Quantity: 2,
    Price: 16.00
  },
  
  {
    OrderItemId: 'OI006',
    OrderId: 'ORD003',
    ProductId: 'PRD010',
    VariantId: 'VAR015',
    Quantity: 1,
    Price: 89.00
  },
  {
    OrderItemId: 'OI007',
    OrderId: 'ORD003',
    ProductId: 'PRD001',
    VariantId: 'VAR003',
    Quantity: 3,
    Price: 15.00
  },
  
  {
    OrderItemId: 'OI008',
    OrderId: 'ORD004',
    ProductId: 'PRD003',
    VariantId: 'VAR007',
    Quantity: 2,
    Price: 18.00
  },
  {
    OrderItemId: 'OI009',
    OrderId: 'ORD004',
    ProductId: 'PRD004',
    VariantId: 'VAR009',
    Quantity: 1,
    Price: 22.00
  },
  
  {
    OrderItemId: 'OI010',
    OrderId: 'ORD005',
    ProductId: 'PRD006',
    VariantId: 'VAR014',
    Quantity: 1,
    Price: 25.00
  },
  {
    OrderItemId: 'OI011',
    OrderId: 'ORD005',
    ProductId: 'PRD009',
    VariantId: null,
    Quantity: 1,
    Price: 18.00
  },
  
  {
    OrderItemId: 'OI012',
    OrderId: 'ORD006',
    ProductId: 'PRD001',
    VariantId: 'VAR002',
    Quantity: 4,
    Price: 15.00
  },
  {
    OrderItemId: 'OI013',
    OrderId: 'ORD006',
    ProductId: 'PRD002',
    VariantId: 'VAR006',
    Quantity: 2,
    Price: 12.00
  },
  
  {
    OrderItemId: 'OI014',
    OrderId: 'ORD007',
    ProductId: 'PRD005',
    VariantId: 'VAR011',
    Quantity: 1,
    Price: 85.00
  },
  
  {
    OrderItemId: 'OI015',
    OrderId: 'ORD008',
    ProductId: 'PRD003',
    VariantId: 'VAR008',
    Quantity: 1,
    Price: 18.00
  },
  {
    OrderItemId: 'OI016',
    OrderId: 'ORD008',
    ProductId: 'PRD007',
    VariantId: null,
    Quantity: 1,
    Price: 14.00
  },
  {
    OrderItemId: 'OI017',
    OrderId: 'ORD008',
    ProductId: 'PRD008',
    VariantId: null,
    Quantity: 1,
    Price: 16.00
  },
  
  {
    OrderItemId: 'OI018',
    OrderId: 'ORD009',
    ProductId: 'PRD010',
    VariantId: 'VAR016',
    Quantity: 1,
    Price: 159.00
  },
  
  {
    OrderItemId: 'OI019',
    OrderId: 'ORD010',
    ProductId: 'PRD001',
    VariantId: 'VAR001',
    Quantity: 2,
    Price: 15.00
  },
  {
    OrderItemId: 'OI020',
    OrderId: 'ORD010',
    ProductId: 'PRD004',
    VariantId: 'VAR009',
    Quantity: 3,
    Price: 22.00
  },
  {
    OrderItemId: 'OI021',
    OrderId: 'ORD010',
    ProductId: 'PRD002',
    VariantId: 'VAR004',
    Quantity: 1,
    Price: 12.00
  },
  
  {
    OrderItemId: 'OI022',
    OrderId: 'ORD011',
    ProductId: 'PRD005',
    VariantId: 'VAR010',
    Quantity: 1,
    Price: 65.00
  },
  
  {
    OrderItemId: 'OI023',
    OrderId: 'ORD012',
    ProductId: 'PRD006',
    VariantId: 'VAR014',
    Quantity: 1,
    Price: 25.00
  }
];

export const mockBookings = [
  {
    BookingId: 'BKG001',
    UserId: 'USR001',
    BookingTime: '2026-03-15T10:00:00Z',
    Status: 'Confirmed',
    Notes: 'Please use gentle products - sensitive skin',
    CreatedAt: '2026-03-01T14:30:00Z'
  },
  {
    BookingId: 'BKG002',
    UserId: 'USR001',
    BookingTime: '2026-03-20T14:00:00Z',
    Status: 'Confirmed',
    Notes: 'Would like French manicure style',
    CreatedAt: '2026-03-05T10:15:00Z'
  },
  {
    BookingId: 'BKG003',
    UserId: 'USR001',
    BookingTime: '2026-03-18T11:30:00Z',
    Status: 'C',
    Notes: 'First time trying gel polish',
    CreatedAt: '2026-03-10T16:45:00Z'
  },
  {
    BookingId: 'BKG004',
    UserId: 'USR001',
    BookingTime: '2026-02-28T13:00:00Z',
    Status: 'Completed',
    Notes: 'Regular manicure and pedicure',
    CreatedAt: '2026-02-20T09:00:00Z'
  },
  {
    BookingId: 'BKG005',
    UserId: 'USR001',
    BookingTime: '2026-02-15T15:30:00Z',
    Status: 'Completed',
    Notes: 'Nail art with floral design requested',
    CreatedAt: '2026-02-10T11:20:00Z'
  },
  {
    BookingId: 'BKG006',
    UserId: 'USR001',
    BookingTime: '2026-02-05T10:00:00Z',
    Status: 'Completed',
    Notes: 'Acrylic nail extensions',
    CreatedAt: '2026-01-28T14:00:00Z'
  },
  {
    BookingId: 'BKG007',
    UserId: 'USR001',
    BookingTime: '2026-01-22T16:00:00Z',
    Status: 'Completed',
    Notes: 'Spa package - anniversary treat',
    CreatedAt: '2026-01-15T10:30:00Z'
  },
  {
    BookingId: 'BKG008',
    UserId: 'USR001',
    BookingTime: '2026-03-25T09:00:00Z',
    Status: 'C',
    Notes: 'Need quick service - event at 2pm',
    CreatedAt: '2026-03-11T08:00:00Z'
  },
  {
    BookingId: 'BKG009',
    UserId: 'USR001',
    BookingTime: '2026-01-10T12:00:00Z',
    Status: 'Completed',
    Notes: 'Pedicure with paraffin treatment',
    CreatedAt: '2026-01-05T16:00:00Z'
  },
  {
    BookingId: 'BKG010',
    UserId: 'USR001',
    BookingTime: '2026-03-22T11:00:00Z',
    Status: 'Cancelled',
    Notes: 'Had to cancel due to schedule conflict',
    CreatedAt: '2026-03-08T13:00:00Z'
  },
  {
    BookingId: 'BKG011',
    UserId: 'USR002',
    BookingTime: '2026-03-16T14:00:00Z',
    Status: 'Confirmed',
    Notes: 'First time customer - nail art with floral design',
    CreatedAt: '2026-03-05T10:15:00Z'
  },
  {
    BookingId: 'BKG012',
    UserId: 'USR003',
    BookingTime: '2026-03-17T11:30:00Z',
    Status: 'C',
    Notes: null,
    CreatedAt: '2026-03-10T16:45:00Z'
  }
];

export const mockBookingServices = [
  {
    BookingServiceId: 'BS001',
    BookingId: 'BKG001',
    ServiceId: 'SV003',
    Price: 55.00
  },
  {
    BookingServiceId: 'BS002',
    BookingId: 'BKG001',
    ServiceId: 'SV009',
    Price: 30.00
  },
  
  {
    BookingServiceId: 'BS003',
    BookingId: 'BKG002',
    ServiceId: 'SV005',
    Price: 50.00
  },
  
  {
    BookingServiceId: 'BS004',
    BookingId: 'BKG003',
    ServiceId: 'SV003',
    Price: 55.00
  },
  
  {
    BookingServiceId: 'BS005',
    BookingId: 'BKG004',
    ServiceId: 'SV001',
    Price: 35.00
  },
  {
    BookingServiceId: 'BS006',
    BookingId: 'BKG004',
    ServiceId: 'SV002',
    Price: 45.00
  },
  
  {
    BookingServiceId: 'BS007',
    BookingId: 'BKG005',
    ServiceId: 'SV004',
    Price: 65.00
  },
  
  {
    BookingServiceId: 'BS008',
    BookingId: 'BKG006',
    ServiceId: 'SV007',
    Price: 75.00
  },
  
  {
    BookingServiceId: 'BS009',
    BookingId: 'BKG007',
    ServiceId: 'SV006',
    Price: 120.00
  },
  
  {
    BookingServiceId: 'BS010',
    BookingId: 'BKG008',
    ServiceId: 'SV001',
    Price: 35.00
  },
  
  {
    BookingServiceId: 'BS011',
    BookingId: 'BKG009',
    ServiceId: 'SV002',
    Price: 45.00
  },
  {
    BookingServiceId: 'BS012',
    BookingId: 'BKG009',
    ServiceId: 'SV009',
    Price: 30.00
  },
  
  {
    BookingServiceId: 'BS013',
    BookingId: 'BKG010',
    ServiceId: 'SV003',
    Price: 55.00
  },
  
  {
    BookingServiceId: 'BS014',
    BookingId: 'BKG011',
    ServiceId: 'SV004',
    Price: 65.00
  },
  
  {
    BookingServiceId: 'BS015',
    BookingId: 'BKG012',
    ServiceId: 'SV006',
    Price: 120.00
  }
];

export const mockServiceReviews = [
  {
    ReviewId: 'SREV001',
    ServiceId: 'SV001',
    UserId: 'USR001',
    CustomerName: 'Emma Wilson',
    Rating: 5,
    Comment: 'Absolutely loved the service! The attention to detail was perfect and my nails looked amazing for weeks. Highly recommend!',
    CreatedAt: '2026-03-08',
    Avatar: '/Profiles/1.jpg'
  },
  {
    ReviewId: 'SREV002',
    ServiceId: 'SV001',
    UserId: 'USR002',
    CustomerName: 'Sophia Brown',
    Rating: 4.5,
    Comment: 'Great experience! Very professional and the results were beautiful. Will definitely come back.',
    CreatedAt: '2026-03-05',
    Avatar: '/Profiles/2.jpg'
  },
  {
    ReviewId: 'SREV003',
    ServiceId: 'SV001',
    UserId: 'USR003',
    CustomerName: 'Olivia Davis',
    Rating: 5,
    Comment: 'Best nail service I\'ve ever had! The technician was skilled and friendly. The whole experience was relaxing and enjoyable.',
    CreatedAt: '2026-03-01',
    Avatar: '/Profiles/3.jpg'
  },
  {
    ReviewId: 'SREV004',
    ServiceId: 'SV001',
    UserId: 'USR004',
    CustomerName: 'Ava Johnson',
    Rating: 4,
    Comment: 'Very good service. Clean environment and professional staff. Would give 5 stars if the wait time was shorter.',
    CreatedAt: '2026-02-28',
    Avatar: '/Profiles/4.jpg'
  },
  
  {
    ReviewId: 'SREV005',
    ServiceId: 'SV002',
    UserId: 'USR005',
    CustomerName: 'Jessica Martinez',
    Rating: 5,
    Comment: 'I love coming here! Clean, professional, and they always do an excellent job. The pedicure is heavenly and my nails always look perfect.',
    CreatedAt: '2026-03-07',
    Avatar: '/Profiles/3.jpg'
  },
  {
    ReviewId: 'SREV006',
    ServiceId: 'SV002',
    UserId: 'USR006',
    CustomerName: 'Isabella Garcia',
    Rating: 4.5,
    Comment: 'Wonderful relaxing experience! My feet feel so soft and refreshed. The massage was heavenly.',
    CreatedAt: '2026-03-03',
    Avatar: '/Profiles/5.jpg'
  },
  {
    ReviewId: 'SREV007',
    ServiceId: 'SV002',
    UserId: 'USR007',
    CustomerName: 'Mia Rodriguez',
    Rating: 5,
    Comment: 'Best pedicure I\'ve ever had! So thorough and relaxing. The polish lasted for weeks without chipping.',
    CreatedAt: '2026-02-26',
    Avatar: '/Profiles/7.jpg'
  },
  
  {
    ReviewId: 'SREV008',
    ServiceId: 'SV003',
    UserId: 'USR008',
    CustomerName: 'Sarah Johnson',
    Rating: 5,
    Comment: 'Absolutely amazing service! The nail technicians are highly skilled and the atmosphere is so relaxing. My gel manicure lasted 3 weeks without chipping!',
    CreatedAt: '2026-03-09',
    Avatar: '/Profiles/1.jpg'
  },
  {
    ReviewId: 'SREV009',
    ServiceId: 'SV003',
    UserId: 'USR009',
    CustomerName: 'Michelle Davis',
    Rating: 5,
    Comment: 'Fantastic! The attention to hygiene and cleanliness is impressive. The staff makes you feel welcome and comfortable. Best salon experience ever!',
    CreatedAt: '2026-03-04',
    Avatar: '/Profiles/6.jpg'
  },
  {
    ReviewId: 'SREV010',
    ServiceId: 'SV003',
    UserId: 'USR010',
    CustomerName: 'Carlotte Lee',
    Rating: 4.5,
    Comment: 'Love my gel nails! They look natural and glossy. Great service and friendly staff.',
    CreatedAt: '2026-02-27',
    Avatar: '/Profiles/8.jpg'
  },
  
  {
    ReviewId: 'SREV011',
    ServiceId: 'SV004',
    UserId: 'USR011',
    CustomerName: 'Emily Cen',
    Rating: 5,
    Comment: 'Best nail salon in town! The nail art designs are creative and unique. The staff is friendly and professional. Highly recommend!',
    CreatedAt: '2026-03-10',
    Avatar: '/Profiles/2.jpg'
  },
  {
    ReviewId: 'SREV012',
    ServiceId: 'SV004',
    UserId: 'USR012',
    CustomerName: 'Amelia Martinez',
    Rating: 5,
    Comment: 'The nail artist is incredibly talented! My custom design came out even better than I imagined. So many compliments!',
    CreatedAt: '2026-03-06',
    Avatar: '/Profiles/9.jpg'
  },
  {
    ReviewId: 'SREV013',
    ServiceId: 'SV004',
    UserId: 'USR013',
    CustomerName: 'Harper Wilson',
    Rating: 4.5,
    Comment: 'Beautiful work! The attention to detail in the nail art is impressive. Worth every penny.',
    CreatedAt: '2026-02-29',
    Avatar: '/Profiles/10.jpg'
  },
  
  {
    ReviewId: 'SREV014',
    ServiceId: 'SV005',
    UserId: 'USR014',
    CustomerName: 'Amanda Wilson',
    Rating: 4,
    Comment: 'Great experience overall! The technicians are talented and pay attention to detail. The only reason for 4 stars is the wait time, but it\'s worth it!',
    CreatedAt: '2026-03-08',
    Avatar: '/Profiles/4.jpg'
  },
  {
    ReviewId: 'SREV015',
    ServiceId: 'SV005',
    UserId: 'USR015',
    CustomerName: 'Evelyn Taylor',
    Rating: 5,
    Comment: 'My acrylic nails look absolutely stunning! They\'re so well done and feel natural. Highly recommend!',
    CreatedAt: '2026-03-02',
    Avatar: '/Profiles/6.jpg'
  },
  
  {
    ReviewId: 'SREV016',
    ServiceId: 'SV006',
    UserId: 'USR016',
    CustomerName: 'Monica Geller',
    Rating: 5,
    Comment: 'Impeccable attention to detail! The spa package was pure luxury - from the hand massage to the paraffin treatment. My hands have never felt better!',
    CreatedAt: '2026-03-11',
    Avatar: '/Profiles/8.jpg'
  },
  {
    ReviewId: 'SREV017',
    ServiceId: 'SV006',
    UserId: 'USR017',
    CustomerName: 'Abigail Anderson',
    Rating: 5,
    Comment: 'The ultimate pampering experience! Every part of the spa package was perfect. I felt completely rejuvenated.',
    CreatedAt: '2026-03-05',
    Avatar: '/Profiles/9.jpg'
  },
  
  {
    ReviewId: 'SREV018',
    ServiceId: 'SV007',
    UserId: 'USR018',
    CustomerName: 'Phoebe Buffay',
    Rating: 4,
    Comment: 'Really lovely experience! The French manicure looks elegant and sophisticated. Minor wait time but the quality makes up for it. Will return!',
    CreatedAt: '2026-03-09',
    Avatar: '/Profiles/9.jpg'
  },
  {
    ReviewId: 'SREV019',
    ServiceId: 'SV007',
    UserId: 'USR019',
    CustomerName: 'Elizabeth Thomas',
    Rating: 5,
    Comment: 'Perfect classic French manicure! Clean lines and beautiful finish. Exactly what I wanted.',
    CreatedAt: '2026-03-01',
    Avatar: '/Profiles/7.jpg'
  },
  
  {
    ReviewId: 'SREV020',
    ServiceId: 'SV008',
    UserId: 'USR020',
    CustomerName: 'Rachel Green',
    Rating: 5,
    Comment: 'Outstanding service from start to finish! The nail extension work is flawless and natural-looking. I get compliments everywhere I go. Worth every penny!',
    CreatedAt: '2026-03-10',
    Avatar: '/Profiles/7.jpg'
  },
  {
    ReviewId: 'SREV021',
    ServiceId: 'SV008',
    UserId: 'USR021',
    CustomerName: 'Cloe Moore',
    Rating: 4.5,
    Comment: 'Beautiful nail extensions! They look so natural and elegant. The technician did an amazing job.',
    CreatedAt: '2026-03-04',
    Avatar: '/Profiles/10.jpg'
  },
  
  {
    ReviewId: 'SREV022',
    ServiceId: 'SV009',
    UserId: 'USR022',
    CustomerName: 'Sophia Taylor',
    Rating: 5,
    Comment: 'Absolutely love this salon! The paraffin treatment is so soothing and moisturizing. My hands feel like silk. Fabulous service every single time!',
    CreatedAt: '2026-03-07',
    Avatar: '/Profiles/5.jpg'
  },
  {
    ReviewId: 'SREV023',
    ServiceId: 'SV009',
    UserId: 'USR023',
    CustomerName: 'Victoria Jackson',
    Rating: 5,
    Comment: 'The most relaxing treatment! My hands and cuticles have never looked better. Pure bliss!',
    CreatedAt: '2026-03-02',
    Avatar: '/Profiles/8.jpg'
  },
  
  {
    ReviewId: 'SREV024',
    ServiceId: 'SV010',
    UserId: 'USR024',
    CustomerName: 'Jennifer Anderson',
    Rating: 5,
    Comment: 'Exceeded all expectations! The technician fixed my damaged nails beautifully. Professional, caring service in a luxurious environment. My new favorite spot!',
    CreatedAt: '2026-03-11',
    Avatar: '/Profiles/10.jpg'
  },
  {
    ReviewId: 'SREV025',
    ServiceId: 'SV010',
    UserId: 'USR025',
    CustomerName: 'Madison White',
    Rating: 4.5,
    Comment: 'Excellent repair work! My nails were in bad shape and now they look healthy and beautiful. Very impressed!',
    CreatedAt: '2026-03-03',
    Avatar: '/Profiles/4.jpg'
  }
];

export const mockProductReviews = [
  {
    ReviewId: 'PREV001',
    ProductId: 'PRD001',
    UserId: 'USR001',
    CustomerName: 'Emma Wilson',
    Rating: 5,
    Comment: 'Absolutely love this nail polish! The Blue Jelly color is stunning and the formula is so smooth. Lasted for 2 weeks without chipping!',
    CreatedAt: '2026-03-08',
    Avatar: '/Profiles/1.jpg'
  },
  {
    ReviewId: 'PREV002',
    ProductId: 'PRD001',
    UserId: 'USR002',
    CustomerName: 'Sophia Brown',
    Rating: 4.5,
    Comment: 'Beautiful color and great quality! The jelly effect looks amazing in the sun. Highly recommend!',
    CreatedAt: '2026-03-05',
    Avatar: '/Profiles/2.jpg'
  },
  {
    ReviewId: 'PREV003',
    ProductId: 'PRD001',
    UserId: 'USR003',
    CustomerName: 'Olivia Davis',
    Rating: 5,
    Comment: 'Best nail polish I\'ve ever used! The colors are vibrant and the formula is long-lasting. Worth every penny!',
    CreatedAt: '2026-03-01',
    Avatar: '/Profiles/3.jpg'
  },

  {
    ReviewId: 'PREV004',
    ProductId: 'PRD002',
    UserId: 'USR004',
    CustomerName: 'Ava Johnson',
    Rating: 5,
    Comment: 'This cuticle oil is amazing! My nails have never been healthier. The lavender scent is so relaxing!',
    CreatedAt: '2026-03-07',
    Avatar: '/Profiles/4.jpg'
  },
  {
    ReviewId: 'PREV005',
    ProductId: 'PRD002',
    UserId: 'USR005',
    CustomerName: 'Jessica Martinez',
    Rating: 4.5,
    Comment: 'Very nourishing! I noticed a difference in my cuticles within a week. The rose scent is lovely.',
    CreatedAt: '2026-03-03',
    Avatar: '/Profiles/5.jpg'
  },
  {
    ReviewId: 'PREV006',
    ProductId: 'PRD002',
    UserId: 'USR006',
    CustomerName: 'Isabella Garcia',
    Rating: 5,
    Comment: 'Excellent product! My nails are stronger and my cuticles are so soft. Love it!',
    CreatedAt: '2026-02-28',
    Avatar: '/Profiles/6.jpg'
  },

  {
    ReviewId: 'PREV007',
    ProductId: 'PRD003',
    UserId: 'USR007',
    CustomerName: 'Mia Rodriguez',
    Rating: 5,
    Comment: 'Perfect kit for beginners and professionals! Has everything you need for amazing nail art. Great value!',
    CreatedAt: '2026-03-09',
    Avatar: '/Profiles/7.jpg'
  },
  {
    ReviewId: 'PREV008',
    ProductId: 'PRD003',
    UserId: 'USR008',
    CustomerName: 'Sarah Johnson',
    Rating: 4.5,
    Comment: 'Great quality tools! The brushes are precise and the rhinestones are beautiful. Very happy with this purchase!',
    CreatedAt: '2026-03-04',
    Avatar: '/Profiles/8.jpg'
  },
  {
    ReviewId: 'PREV009',
    ProductId: 'PRD003',
    UserId: 'USR009',
    CustomerName: 'Michelle Davis',
    Rating: 5,
    Comment: 'Amazing kit! I can create professional-looking nail art at home now. Highly recommend for nail art enthusiasts!',
    CreatedAt: '2026-02-27',
    Avatar: '/Profiles/1.jpg'
  },

  {
    ReviewId: 'PREV010',
    ProductId: 'PRD005',
    UserId: 'USR010',
    CustomerName: 'Carlotte Lee',
    Rating: 5,
    Comment: 'This gel polish set is fantastic! The colors are gorgeous and they last for weeks. Professional quality!',
    CreatedAt: '2026-03-10',
    Avatar: '/Profiles/2.jpg'
  },
  {
    ReviewId: 'PREV011',
    ProductId: 'PRD005',
    UserId: 'USR011',
    CustomerName: 'Amelia White',
    Rating: 4.5,
    Comment: 'Great gel polish! Easy to apply and the shine is incredible. The base and top coat work perfectly together.',
    CreatedAt: '2026-03-06',
    Avatar: '/Profiles/3.jpg'
  },

  {
    ReviewId: 'PREV012',
    ProductId: 'PRD006',
    UserId: 'USR012',
    CustomerName: 'Harper Taylor',
    Rating: 5,
    Comment: 'Best nail files I\'ve ever used! They work so smoothly and don\'t damage my nails. Professional quality!',
    CreatedAt: '2026-03-08',
    Avatar: '/Profiles/4.jpg'
  },
  {
    ReviewId: 'PREV013',
    ProductId: 'PRD006',
    UserId: 'USR013',
    CustomerName: 'Evelyn Anderson',
    Rating: 4.5,
    Comment: 'Great variety of grits! Perfect for shaping and buffing. Very durable and well-made.',
    CreatedAt: '2026-03-02',
    Avatar: '/Profiles/5.jpg'
  },

  {
    ReviewId: 'PREV014',
    ProductId: 'PRD007',
    UserId: 'USR014',
    CustomerName: 'Abigail Thomas',
    Rating: 5,
    Comment: 'This base coat really works! My nails are noticeably stronger after just a few weeks. Amazing product!',
    CreatedAt: '2026-03-09',
    Avatar: '/Profiles/6.jpg'
  },
  {
    ReviewId: 'PREV015',
    ProductId: 'PRD007',
    UserId: 'USR015',
    CustomerName: 'Emily Jackson',
    Rating: 4.5,
    Comment: 'Very effective! My nails feel stronger and healthier. Great for weak or brittle nails.',
    CreatedAt: '2026-03-04',
    Avatar: '/Profiles/7.jpg'
  },

  {
    ReviewId: 'PREV016',
    ProductId: 'PRD008',
    UserId: 'USR016',
    CustomerName: 'Elizabeth Harris',
    Rating: 5,
    Comment: 'The shine is incredible! My manicure looks salon-perfect and lasts so much longer. Best top coat ever!',
    CreatedAt: '2026-03-11',
    Avatar: '/Profiles/8.jpg'
  },
  {
    ReviewId: 'PREV017',
    ProductId: 'PRD008',
    UserId: 'USR017',
    CustomerName: 'Sofia Martin',
    Rating: 5,
    Comment: 'Amazing top coat! The diamond shine is gorgeous and prevents chipping perfectly. Love it!',
    CreatedAt: '2026-03-05',
    Avatar: '/Profiles/1.jpg'
  },

  {
    ReviewId: 'PREV018',
    ProductId: 'PRD009',
    UserId: 'USR018',
    CustomerName: 'Avery Moore',
    Rating: 5,
    Comment: 'Gentle and effective! Removes polish easily without drying out my nails. The aloe vera is so moisturizing!',
    CreatedAt: '2026-03-06',
    Avatar: '/Profiles/2.jpg'
  },
  {
    ReviewId: 'PREV019',
    ProductId: 'PRD009',
    UserId: 'USR019',
    CustomerName: 'Scarlett Wilson',
    Rating: 4.5,
    Comment: 'Great remover! No harsh smell and my nails don\'t feel damaged after use. Very happy with this!',
    CreatedAt: '2026-03-01',
    Avatar: '/Profiles/3.jpg'
  },

  {
    ReviewId: 'PREV020',
    ProductId: 'PRD010',
    UserId: 'USR020',
    CustomerName: 'Grace Clark',
    Rating: 5,
    Comment: 'Perfect bundle! Has everything I need for beautiful nails. Great value for money. Highly recommend!',
    CreatedAt: '2026-03-10',
    Avatar: '/Profiles/4.jpg'
  },
  {
    ReviewId: 'PREV021',
    ProductId: 'PRD010',
    UserId: 'USR021',
    CustomerName: 'Cloe Rodriguez',
    Rating: 5,
    Comment: 'Excellent set! All the products are high quality and work perfectly together. Best purchase ever!',
    CreatedAt: '2026-03-07',
    Avatar: '/Profiles/5.jpg'
  },
  {
    ReviewId: 'PREV022',
    ProductId: 'PRD010',
    UserId: 'USR022',
    CustomerName: 'Lily Martinez',
    Rating: 4.5,
    Comment: 'Great starter kit! Everything you need in one package. The quality is impressive for the price!',
    CreatedAt: '2026-03-02',
    Avatar: '/Profiles/6.jpg'
  }
];

