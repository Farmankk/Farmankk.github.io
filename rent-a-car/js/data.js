// Car4Rent Pakistan - Central Data Layer & Resilient API Bridge

// Smart API endpoint detector: works with http://localhost:3000, 127.0.0.1, or direct file:/// double-click
const getApiBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:3000';
  if (window.location.protocol === 'file:') {
    return 'http://localhost:3000';
  }
  if (window.location.port && window.location.port !== '3000') {
    return `http://${window.location.hostname || 'localhost'}:3000`;
  }
  return '';
};

// Default Embedded Database (Works offline & without server too)
const DEFAULT_INITIAL_DB = {
  "settings": {
    "siteName": "CAR 4 RENT (Pvt. Ltd.)",
    "tagline": "Karachi's Trusted Self-Drive Car Rental Company",
    "logoDisplayMode": "logo_only",
    "logoText": "",
    "logoUrl": "./uploads/logo.webp",
    "currency": "PKR",
    "currencySymbol": "Rs.",
    "emergencyPhone": "+92 302 3650000",
    "emergencyDisplay": "0302-3650000",
    "whatsappNumber": "923023650000",
    "whatsappHelpText": "Hi CAR 4 RENT, I would like to check vehicle availability.",
    "offer": {
      "active": false,
      "badge": "Limited Offer",
      "text": "Get 20% OFF on 3+ days rentals across Pakistan! Use promo code:",
      "promoCode": "LUXURY20",
      "discountPercent": 20
    },
    "footer": {
      "aboutText": "CAR 4 RENT (Pvt. Ltd.) backed by 10 years of excellence. Pristine latest-model vehicles on self-drive with zero security deposit and 100% transparent pricing across Karachi.",
      "phone": "0302-3650000",
      "email": "info@car4rent.pk",
      "address": "Airport Handover | DHA Phase 6 | Gulistan-e-Johar, Karachi",
      "copyright": "© 2026 CAR 4 RENT (Pvt. Ltd.). All rights reserved."
    },
    "heroCarImage": "./uploads/seo-car-1789727514573.webp"
  },
  "users": [
    {
      "id": "user-1",
      "username": "admin",
      "name": "Master Admin",
      "role": "Super Admin"
    }
  ],
  "categories": [
    {
      "id": "cat-hatchback",
      "slug": "hatchback",
      "name": "Economy Hatchback",
      "icon": "🚗",
      "description": "Fuel-efficient, pristine automatic & manual hatchbacks (Alto AGS, Swift) perfect for daily Karachi city commute."
    },
    {
      "id": "cat-sedans",
      "slug": "sedans",
      "name": "Executive Sedan",
      "icon": "🚘",
      "description": "Comfortable, stylish Toyota Yaris ATIV sedans for corporate meetings, family travel, and highway journeys."
    },
    {
      "id": "cat-suvs",
      "slug": "sportutilityvehicle",
      "name": "Crossover SUV",
      "icon": "🚙",
      "description": "Premium Kia Sportage Crossover SUV offering luxury comfort, elevated road presence, and smooth performance."
    },
    {
      "id": "cat-trucks",
      "slug": "pickuptruck",
      "name": "Rugged 4x4 / Luxury Utility SUV",
      "icon": "🛻",
      "description": "Toyota Hilux Revo & Rocco 4x4 luxury utility vehicles built for high executive protocol, security, and tough terrains."
    }
  ],
  "brands": [
    "TOYOTA",
    "KIA",
    "SUZUKI"
  ],
  "cars": [
    {
      "id": "car-1",
      "name": "Sportage 2026",
      "brand": "KIA",
      "category": "sportutilityvehicle",
      "categoryName": "Crossover SUV",
      "dailyPrice": 14900,
      "image": "./uploads/cars/sportage-2026.jpg",
      "hp": "2000 CC",
      "speed": "180 km/h",
      "accel": "11s",
      "transmission": "Automatic PDK",
      "seats": 5,
      "fuel": "High Octane",
      "featured": true,
      "description": "The long wheelbase Sportage enhances its commanding presence with even greater interior space. Generous rear-seat legroom and expanded luggage capacity ensure.\n\nDiscover the Kia Sportage L. Check out its spacious class-leading interior, available AWD with terrain mode, competitive MPG, and much more.",
      "slug": "sportage-2026"
    },
    {
      "id": "car-2",
      "name": "Hilux Revo Rocco",
      "brand": "TOYOTA",
      "category": "pickuptruck",
      "categoryName": "Rugged 4x4 / Luxury Utility SUV",
      "dailyPrice": 24900,
      "image": "./uploads/cars/hilux-revo-rocco.jpg",
      "hp": "2800 CC",
      "speed": "175 km/h",
      "accel": "11s",
      "transmission": "S-Tronic 7-Speed",
      "seats": 5,
      "fuel": "High Octane",
      "featured": true,
      "description": "The Toyota Hilux Revo Rocco is a rugged, premium double-cabin 4x4 pickup truck built for both heavy-duty off-road utility and high-end comfort.\n\nRevo Rocco is about way more than just a car. It's about you and your power move. It's about unleashing your freedom and command. It's about challenging and recharging yourself. It's about your determination to make the move that you have always wanted to.",
      "slug": "hilux-revo-rocco"
    },
    {
      "id": "car-3",
      "name": "Hilux Revo",
      "brand": "TOYOTA",
      "category": "pickuptruck",
      "categoryName": "Rugged 4x4 / Luxury Utility SUV",
      "dailyPrice": 18500,
      "image": "./uploads/cars/hilux-revo.jpg",
      "hp": "2800 CC",
      "speed": "175 km/h",
      "accel": "11s",
      "transmission": "Steptronic",
      "seats": 5,
      "fuel": "Hybrid",
      "featured": true,
      "description": "The Toyota Hilux Revo is a tough, versatile mid-size pickup truck built on a durable body-on-frame platform designed for heavy commercial work and extreme off-road driving.\n\nYear 2026 · Make Toyota · Model Toyota Revo · Body style SUV's · TransmissionContinuously Variable Transmission (CVT) · Seats 5 SEATS · Engine Type 2AR-FE",
      "slug": "hilux-revo"
    },
    {
      "id": "car-4",
      "name": "Swift",
      "brand": "SUZUKI",
      "category": "hatchback",
      "categoryName": "Economy Hatchback",
      "dailyPrice": 6900,
      "image": "./uploads/cars/swift.jpg",
      "hp": "1200 CC",
      "speed": "180 km/h",
      "accel": "12s",
      "transmission": "9G-TRONIC",
      "seats": 5,
      "fuel": "Petrol",
      "featured": false,
      "description": "The Suzuki Swift Automatic is a compact, sporty 5-door hatchback featuring a smooth Continuously Variable Transmission (CVT) designed for efficient and easy city driving.",
      "slug": "swift"
    },
    {
      "id": "car-5",
      "name": "ALTO AUTO",
      "brand": "SUZUKI",
      "category": "hatchback",
      "categoryName": "Economy Hatchback",
      "dailyPrice": 5300,
      "image": "./uploads/cars/alto-auto.jpg",
      "hp": "660 CC",
      "speed": "140 km/h",
      "accel": "20s",
      "transmission": "S tronic",
      "seats": 4,
      "fuel": "Petrol",
      "featured": false,
      "description": "The Suzuki Alto Automatic (known as AGS or Auto Gear Shift in local markets like Pakistan) is a compact, fuel-efficient 5-door hatchback designed for easy city driving.",
      "slug": "alto-auto"
    },
    {
      "id": "car-6",
      "name": "YARIS 2026",
      "brand": "TOYOTA",
      "category": "sedans",
      "categoryName": "Executive Sedan",
      "dailyPrice": 6900,
      "image": "./uploads/cars/yaris-2026.jpg",
      "hp": "1300 CC",
      "speed": "180 km/h",
      "accel": "12s",
      "transmission": "10-Speed Auto",
      "seats": 5,
      "fuel": "Twin-Turbo V6",
      "featured": true,
      "description": "Toyota Yaris 2026 is a popular sedan and hatchback. It gives a smooth ride and has a modern, sporty design. It works well for daily city driving and small families.",
      "slug": "yaris-2026"
    },
    {
      "id": "car-7",
      "name": "YARIS ATIV",
      "brand": "TOYOTA",
      "category": "sedans",
      "categoryName": "Executive Sedan",
      "dailyPrice": 6900,
      "image": "./uploads/cars/yaris-ativ.jpg",
      "hp": "1300 CC",
      "speed": "180 km/h",
      "accel": "12s",
      "transmission": "8-Speed Auto",
      "seats": 5,
      "fuel": "Twin-Turbo V8",
      "featured": true,
      "description": "The Toyota Yaris Ativ (also sold as the Yaris Sedan) is a subcompact, front-wheel-drive 4-door family sedan designed for reliable daily driving, high fuel efficiency, and a comfortable ride.",
      "slug": "yaris-ativ"
    },
    {
      "id": "car-8",
      "name": "ALTO MANUAL",
      "brand": "SUZUKI",
      "category": "hatchback",
      "categoryName": "Economy Hatchback",
      "dailyPrice": 3900,
      "image": "./uploads/cars/alto-manual.jpg",
      "hp": "660 CC",
      "speed": "140 km/h",
      "accel": "20s",
      "transmission": "AMG SPEEDSHIFT 9G",
      "seats": 4,
      "fuel": "Biturbo V8",
      "featured": false,
      "description": "The Suzuki Alto Manual (such as the popular VXR 5-speed manual variant) is a compact, fuel-efficient 5-door hatchback powered by a 658 cc 3-cylinder petrol engine.",
      "slug": "alto-manual"
    }
  ],
  "reviews": [
    {
      "id": "rev-1",
      "clientName": "Hamza Tariq",
      "location": "DHA Phase 6, Lahore",
      "rating": 5,
      "active": true,
      "comment": "Rented the Land Cruiser LC300 on self-drive for a 3-day family wedding. The car arrived polished like a mirror. Pristine condition, smooth verification and booking process."
    },
    {
      "id": "rev-2",
      "clientName": "Zainab Malik",
      "location": "Clifton, Karachi",
      "rating": 5,
      "active": true,
      "comment": "Dream Drive delivered the Mercedes S-Class right to Jinnah International Airport on time for our international guests. The instant WhatsApp quotation gave transparent pricing with zero hassle."
    },
    {
      "id": "rev-3",
      "clientName": "Bilal Sheikh",
      "location": "F-7 Blue Area, Islamabad",
      "rating": 5,
      "active": true,
      "comment": "Took the Porsche 911 for an unforgettable weekend drive up the Murree Expressway. Supercar condition was flawless. Highly recommended for exotic car enthusiasts in Pakistan!"
    }
  ],
  "navMenus": [
    {
      "id": "menu-1",
      "label": "Fleet",
      "url": "#fleet",
      "isHighlight": false
    },
    {
      "id": "menu-2",
      "label": "Why Us",
      "url": "#why-us",
      "isHighlight": false
    },
    {
      "id": "menu-3",
      "label": "Rental Process",
      "url": "#rental-process",
      "isHighlight": false
    },
    {
      "id": "menu-4",
      "label": "Locations",
      "url": "#locations",
      "isHighlight": false
    },
    {
      "id": "menu-5",
      "label": "Rate Calculator",
      "url": "#calculator",
      "isHighlight": false
    }
  ],
  "servicesSection": {
    "subtitle": "Our Services",
    "headline": "We offer brand new car rent services on self-drive with best rate for various occasions.",
    "items": [
      {
        "id": "srv-1",
        "title": "Occasions",
        "desc": "Drive Our Luxurious Cars To Different Occasions You Want",
        "icon": "calendar"
      },
      {
        "id": "srv-2",
        "title": "Wedding",
        "desc": "Drive Our Comfortable And Attractive Cars To Wedding Hassle Free",
        "icon": "heart"
      },
      {
        "id": "srv-3",
        "title": "Events",
        "desc": "Avail Our Self Drive Services To Attend Different Occasions And Events",
        "icon": "sparkles"
      }
    ]
  },
  "whyChooseUsSection": {
    "subtitle": "Why Choose CAR 4 RENT?",
    "headline": "Karachi’s Only 100% Honest & Transparent Self-Drive Rental",
    "companyText": "CAR 4 RENT (Pvt. Ltd.) — Backed by 10 Years of Excellence",
    "description": "Experience genuine self-drive freedom with zero deposit headaches, verified video handovers, and airport meet-and-greet.",
    "points": [
      {
        "num": "1",
        "title": "Zero Security Deposit",
        "desc": "No massive cash deposits held hostage. Simple, transparent verification for complete peace of mind.",
        "icon": "shield-check"
      },
      {
        "num": "2",
        "title": "Pre-Handover Video Proof",
        "desc": "HD 360° timestamped video inspection recorded before key handover protects you against false damage claims.",
        "icon": "video"
      },
      {
        "num": "3",
        "title": "No Hidden Charges",
        "desc": "100% upfront honest pricing with zero surprise charges or fake maintenance fees at return.",
        "icon": "badge-percent"
      },
      {
        "num": "4",
        "title": "Sanitized & Pristine Cabins",
        "desc": "Every car is deep-cleaned, sanitised, and mechanically inspected prior to every single client delivery.",
        "icon": "sparkles"
      },
      {
        "num": "5",
        "title": "Airport & Doorstep Handover",
        "desc": "24/7 Jinnah International Airport pickup or direct doorstep delivery to your home or hotel.",
        "icon": "plane"
      },
      {
        "num": "6",
        "title": "Fast 2-Minute WhatsApp Booking",
        "desc": "No tedious bureaucracy. Chat directly with our manager on WhatsApp and drive in minutes.",
        "icon": "zap"
      }
    ]
  },
  "typography": {
    "headingFont": "Syne",
    "bodyFont": "Plus Jakarta Sans",
    "textTransform": "uppercase",
    "h1Desktop": 42,
    "h1Mobile": 23,
    "h2Desktop": 40,
    "h2Mobile": 24,
    "bodyDesktop": 17,
    "bodyMobile": 14
  },
  "aboutSection": {
    "badge": "Unrivaled Excellence",
    "headline": "Drive Luxury Live Freedom",
    "description": "Experience premium car rentals crafted for comfort, performance, and executive protocol. Whether it's a VIP business delegation, an elite wedding celebration, or an unforgettable weekend tour, our fleet is tailored to elevate your journey."
  },
  "fleetSection": {
    "badge": "Curated Collection",
    "headline": "Find Your Perfect Ride",
    "description": "Explore our handpicked collection of exotic supercars, presidential sedans, and luxury SUVs across Pakistan. All rates in PKR."
  },
  "statsSection": [
    {
      "id": "stat-1",
      "num": "500+",
      "label": "Luxury Cars"
    },
    {
      "id": "stat-2",
      "num": "24/7",
      "label": "Road Assistance"
    },
    {
      "id": "stat-3",
      "num": "100%",
      "label": "Service Guarantee"
    },
    {
      "id": "stat-4",
      "num": "60+",
      "label": "Pickup Locations"
    },
    {
      "id": "stat-5",
      "num": "800+",
      "label": "Satisfied Clients"
    }
  ],
  "heroButtons": {
    "btn1Text": "Book Instantly via WhatsApp",
    "btn2Text": "View Available Cars"
  },
  "seoSettings": {
    "siteTitle": "CAR 4 RENT (Pvt. Ltd.) | Karachi's Trusted Self-Drive Car Rental Company",
    "titleSeparator": "|",
    "metaDescription": "Top-rated rent a car in Karachi. Daily, weekly & monthly rentals on self-drive with zero deposit. 24/7 Jinnah Airport pickup & DHA delivery. Book at lowest rates!",
    "metaKeywords": "rent a car karachi, car rental karachi without driver, cheap car hire karachi, karachi airport car rental, monthly car rental karachi, wedding car rental karachi, luxury prado rent karachi, top rating rent a car, best rent a car, top rating rent a car in karachi, top rating rent a car in karachi, rent a car gulshan, Find the best Without Driver in Karachi, Self Drive Cars available in Karachi Without Driver, Can I rent a car Take Control with Self Drive Rent A Car Karachi, Rent a car in Karachi with flexible self-drive services, Rent a car karachi self drive without driver near me, Rent a car karachi self drive without driver olx, Rent a car Karachi price per day, Renting a car in Karachi costs between Karachi Rent A Car PKR 3900 and PKR 6500 per day, Cheap car hire in Karachi from Rs6900/day, Car Rental Karachi & Transport Service Karachi",
    "h1Heading": "Karachi’s Trusted Self-Drive Car Rental Company",
    "heroSubtitle": "Backed by 10 years of excellence. Rent pristine, latest-model vehicles with zero security deposit and no hidden fees.",
    "canonicalUrl": "https://car4rent.com.pk",
    "targetCity": "Karachi",
    "targetRegion": "Sindh",
    "targetCountry": "Pakistan",
    "latitude": "24.8950737",
    "longitude": "67.1386781",
    "googleVerification": "nIxMLU7SuaNak4pKrWIkLsQ8PuYYsYoV0Z646guRxLU",
    "bingVerification": "5E6B63B2F9F0D177ECC206357E67704A",
    "ga4MeasurementId": "G-TP31G0SPXG",
    "gtmId": "",
    "googleBusinessUrl": "https://www.google.com/maps/place/Jinnah+International+Airport/@24.8950737,67.1386781,15.5z/data=!4m6!3m5!1s0x3eb339c72ec76665:0xec5d1d821453c988!8m2!3d24.9007815!4d67.1681027!16zL20vMGNwcWRf?entry=ttu&g_ep=EgoyMDI2MDkwOS4wIKXMDSoASAFQAw%3D%3D",
    "businessName": "Car 4 Rent Karachi",
    "priceRange": "₨₨",
    "openingHours": "Mo-Su 00:00-23:59",
    "ogImage": "./uploads/seo-car-1789727514573.webp",
    "customRobotsTxt": "User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /api/admin/\nDisallow: /wp-admin/\nDisallow: /wp-content/\nDisallow: /feed/\nDisallow: /comments/feed/\n\nSitemap: https://car4rent.com.pk/sitemap.xml"
  },
  "seoLandingPages": [
    {
      "id": "seo-airport",
      "slug": "karachi-airport-rent-a-car",
      "navTitle": "Airport Rent a Car",
      "title": "Karachi Airport Rent a Car | Jinnah International Airport Transfers | Car 4 Rent",
      "metaDescription": "Karachi Airport rent a car service with 24/7 flight tracking, terminal pickup & drop-off at Jinnah International Airport. Premium & budget cars on self-drive with zero deposit.",
      "focusKeywords": "Karachi airport rent a car, rent a car Karachi airport, car rental Karachi airport, Jinnah International Airport rent a car, airport pickup car Karachi, airport drop off car Karachi",
      "h1": "Karachi Airport Rent a Car",
      "h2": "Reliable Car Rental at Jinnah International Airport",
      "content": "Landing at Jinnah International Airport, Karachi? Car 4 Rent provides dedicated 24/7 airport car rental and transfer services. Whether you are visiting Karachi for business, returning from abroad, or attending a family event, our handover officer will be waiting for you right at the terminal exit.\n\nWe monitor your flight schedules in real time, so even if your flight is delayed, your reserved car will be ready on time. Avoid airport taxi hassles and enjoy air-conditioned comfort, transparent rates, and swift doorstep drop-off across DHA, Clifton, Gulshan, Malir, and all Karachi neighborhoods.",
      "highlights": [
        "24/7 Meet & Greet at Jinnah Terminal",
        "Live Flight Delay Tracking",
        "Flexible Self-Drive Fleet Options",
        "Clean, Air-Conditioned Fleet",
        "Direct Drop-Off to All Karachi Areas",
        "Transparent Rates & No Hidden Charges"
      ],
      "targetAreas": [
        "Jinnah International Airport Terminal 1",
        "Malir Cantt",
        "Shahrah-e-Faisal",
        "DHA Karachi (Phases 1 to 8)",
        "Clifton Karachi",
        "Gulshan-e-Iqbal",
        "PECHS & Saddar"
      ],
      "faqs": [
        {
          "question": "How can I book a car from Karachi Airport?",
          "answer": "You can book directly via WhatsApp or phone call before your departure. Simply share your flight number, arrival time, and chosen car. Our representative will coordinate terminal pickup."
        },
        {
          "question": "Do you provide airport pickup and drop-off?",
          "answer": "Yes! We provide both terminal pickup upon arrival at Jinnah International Airport and doorstep pickup for your airport drop-off departure."
        },
        {
          "question": "What happens if my flight to Karachi is delayed?",
          "answer": "We track your flight in real time using your flight number. Our handover team and car will wait for you without any cancellation penalty for standard flight delays."
        },
        {
          "question": "Can I pick up my self-drive car directly at Karachi Airport?",
          "answer": "Yes! Our airport representative will meet you at the Terminal 1 arrival exit with your sanitized vehicle and keys so you can drive off immediately without waiting."
        },
        {
          "question": "How far in advance should I book my airport car?",
          "answer": "We recommend booking at least 12 to 24 hours prior to your landing to ensure your preferred vehicle category is pre-sanitized and staged."
        }
      ],
      "ctaText": "Book Airport Transfer Now",
      "active": true,
      "priority": "0.9"
    },
    {
        "id": "seo-luxury",
        "slug": "luxury-car-rental-karachi",
        "navTitle": "Luxury Rental",
        "title": "Luxury Car Rental in Karachi | Self Drive Luxury Fleet | Car 4 Rent",
        "metaDescription": "Rent luxury cars in Karachi on self-drive with zero deposit. Sportage 2026, Revo Rocco, executive sedans for weddings, VIP protocol & airport pickup. Book online!",
        "focusKeywords": "luxury car rental Karachi, luxury rent a car Karachi, self drive luxury car Karachi, rent a car Karachi luxury",
        "h1": "Luxury Car Rental in Karachi",
        "h2": "Premium Self-Drive Luxury Fleet Across Karachi",
        "content": "Experience the thrill of self-drive luxury with Car 4 Rent premium vehicle collection in Karachi. Whether you need an executive SUV for high-profile business meetings, an elite sedan for weddings, or a rugged 4x4 for VIP travel, our fleet delivers unrivaled prestige, comfort, and performance.\n\nEnjoy transparent rates, flexible daily or weekly rentals, zero security deposit on verified documents, and guaranteed doorstep delivery across DHA, Clifton, and all Karachi locations.",
        "highlights": [
                "Zero Security Deposit on Verified Documents",
                "Latest Model Luxury SUVs & Executive Sedans",
                "Pre-Handover 360° Video Proof",
                "24/7 Jinnah Airport & Doorstep Delivery",
                "Pristine Sanitized & Inspected Vehicles",
                "100% Transparent Rates & No Hidden Charges"
        ],
        "targetAreas": [
                "DHA Karachi (Phases 1-8)",
                "Clifton Karachi",
                "Shahrah-e-Faisal Corporate Corridor",
                "PECHS & Saddar",
                "Gulshan-e-Iqbal",
                "Jinnah International Airport Karachi",
                "Bahria Town Karachi"
        ],
        "faqs": [
                {
                        "question": "Which luxury cars are available for self-drive in Karachi?",
                        "answer": "Our luxury self-drive fleet features the Kia Sportage 2026, Toyota Hilux Revo Rocco 4x4, Toyota Yaris ATIV, and other executive models."
                },
                {
                        "question": "Do you require a security deposit for luxury self-drive rentals?",
                        "answer": "No! Unlike other rental companies in Karachi, Car 4 Rent provides self-drive luxury rentals with Zero Security Deposit upon standard CNIC and driving license verification."
                },
                {
                        "question": "Can I book a luxury self-drive car for wedding events in Karachi?",
                        "answer": "Yes! Our luxury vehicles are frequently booked for wedding ceremonies, photo shoots, and VIP delegations across Karachi with doorstep drop-off."
                },
                {
                        "question": "What documents are required to book a luxury self-drive car?",
                        "answer": "Pakistani residents need a valid CNIC and Driving License. Overseas Pakistanis need a valid Passport, Visa, and an International or Home-Country Driving License."
                }
        ],
        "ctaText": "Book Luxury Car on Self Drive",
        "active": true,
        "priority": "0.9"
},
    {
      "id": "seo-without-driver",
      "slug": "rent-a-car-without-driver-karachi",
      "navTitle": "Without Driver",
      "title": "Rent a Car Without Driver in Karachi | Self Drive Rental | Car 4 Rent",
      "metaDescription": "Enjoy the freedom of self drive rent a car without driver in Karachi. Brand new cars on daily, weekly, and monthly self drive with quick, transparent verification.",
      "focusKeywords": "rent a car without driver Karachi, self drive car rental Karachi, rent a car self drive Karachi, car without driver Karachi",
      "h1": "Rent a Car Without Driver in Karachi",
      "h2": "Enjoy The Pleasure of Self Drive Across Karachi",
      "content": "Experience total privacy, independence, and driving pleasure with Car 4 Rent self-drive fleet in Karachi. We provide brand new, meticulously serviced Japanese and local vehicles on self-drive with transparent terms and hassle-free documentation.\n\nFrom agile city hatchbacks and executive sedans to rugged 4x4 SUVs, choose the car that matches your style and explore Karachi on your own schedule.",
      "highlights": [
        "Brand New, Well-Maintained Vehicles",
        "Fast & Transparent Verification",
        "Free Doorstep Delivery in Karachi",
        "Comprehensive Insurance Coverage",
        "Unlimited Driving Privacy",
        "24/7 Roadside Mechanical Support"
      ],
      "targetAreas": [
        "Karachi (All Zones)",
        "DHA Karachi Phase 1-8",
        "Clifton",
        "Gulshan-e-Iqbal",
        "Gulistan-e-Johar",
        "North Nazimabad",
        "Malir Cantt"
      ],
      "faqs": [
        {
          "question": "What documents are required for self-drive rent a car in Karachi?",
          "answer": "You need an original CNIC (or Passport for overseas Pakistanis/foreigners), a valid Pakistan Driving License (or International Permit), and standard security deposit."
        },
        {
          "question": "Is security deposit refundable?",
          "answer": "Yes, 100% refundable upon safe return of the vehicle after inspection."
        },
        {
          "question": "Do you deliver self-drive cars to home or office in Karachi?",
          "answer": "Yes! We offer doorstep vehicle delivery and pickup across Karachi."
        },
        {
          "question": "What is the fuel policy on self-drive cars?",
          "answer": "We provide the vehicle with a documented fuel level, and you simply return it with the same level."
        }
      ],
      "ctaText": "Reserve Self Drive Car",
      "active": true,
      "priority": "0.8"
    },
    {
      "id": "seo-monthly",
      "slug": "monthly-car-rental-karachi",
      "navTitle": "Monthly Car Rental",
      "title": "Monthly Car Rental Karachi | Long Term Deals | Car 4 Rent",
      "metaDescription": "Save big with monthly car rental in Karachi. Heavily discounted rates for corporate clients, expats, and residents. Free maintenance and backup car included.",
      "focusKeywords": "monthly car rental Karachi, long term car rental Karachi, monthly rent a car Karachi, corporate car rental Karachi",
      "h1": "Monthly Car Rental in Karachi",
      "h2": "Affordable Long-Term Car Hire for Individuals & Businesses",
      "content": "Looking for hassle-free monthly mobility in Karachi without the high expense of car ownership? Car 4 Rent monthly car rental service offers huge cost savings, dedicated maintenance, and total convenience.\n\nIdeal for corporate companies, overseas Pakistanis staying for vacation, and residents needing reliable long-term transportation. Choose on self-drive with zero deposit on flexible month-to-month contracts.",
      "highlights": [
        "Up to 35% Cost Savings Over Daily Rates",
        "Free Routine Maintenance & Oil Changes",
        "Instant Replacement Vehicle Guarantee",
        "Official Corporate GST/Tax Invoicing",
        "No Long-Term Lock-in or Penalty",
        "Dedicated Karachi Account Manager"
      ],
      "targetAreas": [
        "Karachi Commercial Centers",
        "I.I. Chundrigar Road",
        "Clifton & DHA Corporate Hubs",
        "Shahrah-e-Faisal Business District",
        "Korangi & SITE Industrial Areas"
      ],
      "faqs": [
        {
          "question": "How much can I save on a monthly rental compared to daily rates?",
          "answer": "Our monthly car rental packages offer up to 30% to 40% discount compared to accumulating daily rental rates."
        },
        {
          "question": "Who handles vehicle maintenance during the monthly rental?",
          "answer": "Car 4 Rent takes care of all periodic maintenance, periodic servicing, and oil changes at zero extra cost."
        },
        {
          "question": "Do you provide a replacement car if the vehicle needs servicing?",
          "answer": "Yes, we guarantee an immediate backup vehicle so your routine or business is never disrupted."
        },
        {
          "question": "Can corporations get monthly billing and invoices for tax purposes?",
          "answer": "Yes, we provide official corporate agreements, NTN registered invoices, and customized fleet lease plans."
        }
      ],
      "ctaText": "Get Monthly Rental Quote",
      "active": true,
      "priority": "0.8"
    }
  ],
  "seoFaqs": [
    {
      "id": "faq-1",
      "question": "How can I rent a car in Karachi with Car 4 Rent?",
      "answer": "Renting a car is quick and simple: Choose your desired car from our fleet, select your rental duration and desired vehicle on self-drive, and contact us via WhatsApp or Phone at 0302-3650000 for instant booking and doorstep delivery in Karachi."
    },
    {
      "id": "faq-2",
      "question": "Do you provide Karachi Airport pickup and drop-off service?",
      "answer": "Yes, we provide 24/7 dedicated pickup and drop-off service at Jinnah International Airport Karachi with flight delay tracking and terminal meet-and-greet."
    },
    {
      "id": "faq-3",
      "question": "Can I rent a car on self-drive without a driver in Karachi?",
      "answer": "Yes! We specialize in self-drive rentals with brand new cars. All you need is your valid CNIC/Passport, Pakistan or International Driving License, and standard security deposit."
    },
    {
      "id": "faq-4",
      "question": "Which areas in Karachi do you deliver cars to?",
      "answer": "We provide doorstep car delivery across all areas of Karachi including DHA (Phases 1-8), Clifton, Gulshan-e-Iqbal, PECHS, Shahrah-e-Faisal, Malir Cantt, Gulistan-e-Johar, Saddar, North Nazimabad, and Bahria Town Karachi."
    },
    {
      "id": "faq-5",
      "question": "What is the minimum rental period?",
      "answer": "Our minimum rental duration is 1 day (24 hours). We also provide attractive discounted rates for weekly and monthly rentals."
    },
    {
      "id": "faq-6",
      "question": "What happens if the vehicle breaks down or needs assistance?",
      "answer": "We provide 24/7 roadside assistance across Karachi. In the rare event of a mechanical problem, our team will promptly repair or replace your vehicle immediately."
    }
  ],
  "karachiAreas": [
    {
      "id": "area-1",
      "name": "Karachi Airport & Malir",
      "slug": "karachi-airport",
      "title": "Rent a Car Karachi Airport & Malir Cantt",
      "desc": "24/7 Jinnah International Airport transfers, terminal meet & greet, and fast delivery in Malir Cantt."
    },
    {
      "id": "area-2",
      "name": "DHA Karachi (Phases 1-8)",
      "slug": "dha-karachi",
      "title": "Rent a Car DHA Karachi",
      "desc": "Doorstep delivery of executive sedans and luxury SUVs across DHA Phase 1 to Phase 8."
    },
    {
      "id": "area-3",
      "name": "Clifton Karachi",
      "slug": "clifton-karachi",
      "title": "Rent a Car Clifton Karachi",
      "desc": "Self drive luxury and executive car rentals for residents, seaside hotels, and business suites in Clifton."
    },
    {
      "id": "area-4",
      "name": "Gulshan-e-Iqbal",
      "slug": "gulshan-karachi",
      "title": "Rent a Car Gulshan Karachi",
      "desc": "Affordable daily, weekly, and wedding car hire delivered directly to your home in Gulshan-e-Iqbal."
    },
    {
      "id": "area-5",
      "name": "Shahrah-e-Faisal & PECHS",
      "slug": "shahrah-e-faisal",
      "title": "Rent a Car Shahrah-e-Faisal & PECHS",
      "desc": "Corporate car rentals, airport corridor transfers, and executive business fleet services."
    },
    {
      "id": "area-6",
      "name": "Gulistan-e-Johar",
      "slug": "johar-karachi",
      "title": "Rent a Car Gulistan-e-Johar",
      "desc": "Reliable budget and family car rental delivered promptly in all blocks of Gulistan-e-Johar."
    },
    {
      "id": "area-7",
      "name": "Saddar & I.I. Chundrigar",
      "slug": "saddar-karachi",
      "title": "Rent a Car Saddar & Financial District",
      "desc": "Doorstep self-drive car delivery for business executives visiting Karachi financial heart and corporate towers."
    },
    {
      "id": "area-8",
      "name": "North Nazimabad",
      "slug": "north-nazimabad",
      "title": "Rent a Car North Nazimabad",
      "desc": "Spacious family cars, sedans, and self-drive rentals with fast doorstep drop-off."
    }
  ],
  "calculatorConfig": {
    "features": {
      "showLocations": false,
      "showAddons": false,
      "durationMode": "slots_only",
      "showSlotsBar": true,
      "showPromoCode": true,
      "showContactDetails": true,
      "showSecurityDeposit": true,
      "showOfficialQuoteBtn": true,
      "showWhatsAppBtn": true,
      "showPrintBtn": true
    },
    "securityDeposit": {
      "enabled": false,
      "amount": 0,
      "label": "No Security Deposit",
      "policyText": "100% Refundable on vehicle inspection",
      "includeInGrandTotal": false
    },
    "locations": [
      {
        "id": "loc-1",
        "name": "Karachi - Jinnah International Airport",
        "active": true
      },
      {
        "id": "loc-2",
        "name": "Karachi - Clifton / DHA Phase 1-8",
        "active": true
      },
      {
        "id": "loc-3",
        "name": "Karachi - Gulshan-e-Iqbal / Johar",
        "active": true
      },
      {
        "id": "loc-4",
        "name": "Karachi - Shahrah-e-Faisal / PECHS",
        "active": true
      },
      {
        "id": "loc-5",
        "name": "Karachi - Saddar / I.I. Chundrigar",
        "active": true
      },
      {
        "id": "loc-6",
        "name": "Karachi - North Nazimabad",
        "active": true
      },
      {
        "id": "loc-7",
        "name": "Lahore - Allama Iqbal Airport",
        "active": true
      },
      {
        "id": "loc-8",
        "name": "Lahore - Gulberg / DHA Doorstep Delivery",
        "active": true
      },
      {
        "id": "loc-9",
        "name": "Islamabad - New International Airport",
        "active": true
      },
      {
        "id": "loc-10",
        "name": "Islamabad - Blue Area / F-6 / F-7",
        "active": true
      },
      {
        "id": "loc-11",
        "name": "Rawalpindi - Bahria Town / Cantt",
        "active": true
      }
    ],
    "addons": [
      {
        "id": "addon-1",
        "title": "Express Doorstep Delivery",
        "description": "Priority vehicle handover at your location or airport terminal",
        "price": 8000,
        "pricingType": "daily",
        "defaultChecked": false,
        "active": true
      },
      {
        "id": "addon-2",
        "title": "Zero-Excess Takaful",
        "description": "Comprehensive damage waiver",
        "price": 5000,
        "pricingType": "daily",
        "defaultChecked": false,
        "active": true
      },
      {
        "id": "addon-3",
        "title": "Unlimited Intercity Km",
        "description": "Motorway travel freedom",
        "price": 4000,
        "pricingType": "daily",
        "defaultChecked": false,
        "active": true
      },
      {
        "id": "addon-4",
        "title": "In-Car 5G Hotspot",
        "description": "High speed mobile Wi-Fi",
        "price": 1500,
        "pricingType": "daily",
        "defaultChecked": false,
        "active": true
      }
    ],
    "slots": [
      {
        "id": "slot-1",
        "days": 1,
        "label": "1 Day",
        "discountType": "amount_per_day",
        "discountValue": 0,
        "badge": "Standard Rate",
        "active": true
      },
      {
        "id": "slot-2",
        "days": 3,
        "label": "3 Days",
        "discountType": "amount_per_day",
        "discountValue": 200,
        "badge": "Save Rs. 200/day",
        "active": true
      },
      {
        "id": "slot-3",
        "days": 7,
        "label": "7 Days (Weekly)",
        "discountType": "amount_per_day",
        "discountValue": 500,
        "badge": "Save Rs. 500/day",
        "active": true
      },
      {
        "id": "slot-4",
        "days": 15,
        "label": "15 Days",
        "discountType": "amount_per_day",
        "discountValue": 800,
        "badge": "Save Rs. 800/day",
        "active": true
      },
      {
        "id": "slot-5",
        "days": 30,
        "label": "30 Days (Monthly)",
        "discountType": "amount_per_day",
        "discountValue": 1200,
        "badge": "Save Rs. 1200/day",
        "active": true
      }
    ]
  }
};

// Initialize LocalStorage Backup
function getLocalDB() {
  try {
    const raw = localStorage.getItem('dream_drive_db');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_INITIAL_DB,
        ...parsed,
        calculatorConfig: (parsed.calculatorConfig && Object.keys(parsed.calculatorConfig).length) 
          ? parsed.calculatorConfig 
          : DEFAULT_INITIAL_DB.calculatorConfig,
        settings: { ...DEFAULT_INITIAL_DB.settings, ...(parsed.settings || {}) }
      };
    }
  } catch (e) {}
  localStorage.setItem('dream_drive_db', JSON.stringify(DEFAULT_INITIAL_DB));
  return JSON.parse(JSON.stringify(DEFAULT_INITIAL_DB));
}

function saveLocalDB(db) {
  try {
    localStorage.setItem('dream_drive_db', JSON.stringify(db));
  } catch (e) {}
}

// Fetch public data with instant fallback
async function fetchPublicData() {
  const base = getApiBase();
  try {
    const res = await fetch(`${base}/api/public-data`);
    if (res.status === 403) {
      window.location.href = '/activate.html';
      return null;
    }
    if (res.ok) {
      const data = await res.json();
      saveLocalDB({ ...getLocalDB(), ...data });
      return data;
    }
  } catch (e) {
    console.warn('Network fetch unavailable, using offline database:', e.message);
  }

  // Fallback to local DB
  const local = getLocalDB();
  return {
    settings: local.settings || DEFAULT_INITIAL_DB.settings,
    categories: (local.categories && local.categories.length) ? local.categories : DEFAULT_INITIAL_DB.categories,
    brands: (local.brands && local.brands.length) ? local.brands : DEFAULT_INITIAL_DB.brands,
    cars: (local.cars && local.cars.length) ? local.cars : DEFAULT_INITIAL_DB.cars,
    reviews: ((local.reviews && local.reviews.length) ? local.reviews : DEFAULT_INITIAL_DB.reviews).filter(r => r.active !== false),
    navMenus: local.navMenus || DEFAULT_INITIAL_DB.navMenus || [],
    servicesSection: local.servicesSection || DEFAULT_INITIAL_DB.servicesSection || {},
    whyChooseUsSection: local.whyChooseUsSection || DEFAULT_INITIAL_DB.whyChooseUsSection || {},
    calculatorConfig: local.calculatorConfig || DEFAULT_INITIAL_DB.calculatorConfig || {}
  };
}

// Fetch all data for authenticated admin with token
async function fetchAdminData() {
  const base = getApiBase();
  const token = sessionStorage.getItem('c4r_admin_token') || localStorage.getItem('c4r_admin_token');
  if (!token) return null;

  try {
    const res = await fetch(`${base}/api/admin/all`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem('c4r_admin_token');
      localStorage.removeItem('c4r_admin_token');
      return null;
    }
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {
    console.warn('Admin fetch error:', e.message);
  }

  return null;
}

// Format Currency in PKR
function formatPKR(amount) {
  if (isNaN(amount)) return 'Rs. 0';
  return 'Rs. ' + Math.round(amount).toLocaleString('en-PK');
}


